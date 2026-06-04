// api/cancel-payment.js — Vercel Function
// Annulation avec remboursement partiel Stripe (retenue commission)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});

  try {
    const { reservation_id, role } = req.body;
    if(!reservation_id || !role) return res.status(400).json({error: 'Paramètres manquants'});

    // Récupérer la réservation depuis Supabase
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      'https://nsvosbuxkpnoasfilyqy.supabase.co',
      process.env.SUPABASE_SERVICE_KEY
    );

    const { data: resa, error: resaErr } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', reservation_id)
      .single();

    if(resaErr || !resa) return res.status(404).json({error: 'Réservation introuvable'});

    // Vérifier qu'il y a bien un paiement Stripe
    if(!resa.stripe_payment_id) {
      // Pas de paiement Stripe — juste annuler dans Supabase
      const commission_annulation = role === 'loueur' ? 10 : 8;
      await supabase.from('reservations').update({
        statut: 'annulee',
        commission_annulation
      }).eq('id', reservation_id);
      return res.status(200).json({success: true, remboursement: 0});
    }

    const prix_total = resa.prix_total || 0;
    const commission_annulation = role === 'loueur' ? 10 : 8;

    // Calculer le remboursement
    // Locataire annule → 8% retenus → remboursement 92%
    // Loueur annule → 10% retenus → remboursement 100% au locataire (pénalité payée par loueur)
    const taux_remboursement = role === 'locataire' ? 0.92 : 1.0;
    const montant_rembourse = Math.round(prix_total * taux_remboursement * 100); // en centimes

    // Faire le remboursement partiel via Stripe
    const secret = process.env.STRIPE_SECRET_KEY;

    // Récupérer le PaymentIntent pour obtenir le charge_id
    const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${resa.stripe_payment_id}`, {
      headers: { 'Authorization': 'Bearer ' + secret }
    });
    const pi = await piRes.json();

    if(pi.error) {
      console.error('Stripe PI error:', pi.error);
      // Continuer quand même l'annulation Supabase
    } else {
      const chargeId = pi.latest_charge;
      if(chargeId && montant_rembourse > 0) {
        const refundParams = new URLSearchParams({
          charge: chargeId,
          amount: montant_rembourse
        });
        const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + secret,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: refundParams.toString()
        });
        const refund = await refundRes.json();
        if(refund.error) console.error('Refund error:', refund.error);
      }
    }

    // Mettre à jour Supabase
    await supabase.from('reservations').update({
      statut: 'annulee',
      commission_annulation
    }).eq('id', reservation_id);

    const montant_retenu = Math.round(prix_total * (commission_annulation / 100) * 100) / 100;
    return res.status(200).json({
      success: true,
      remboursement: (montant_rembourse / 100).toFixed(2),
      retenu: montant_retenu.toFixed(2)
    });

  } catch(err) {
    console.error('Cancel error:', err);
    return res.status(500).json({error: err.message});
  }
};
