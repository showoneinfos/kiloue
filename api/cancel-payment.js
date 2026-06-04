// api/cancel-payment.js — Vercel Function
// Annulation avec remboursement partiel Stripe

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});

  try {
    const { reservation_id, role } = req.body;
    if(!reservation_id || !role) return res.status(400).json({error: 'Paramètres manquants'});

    const secret = process.env.STRIPE_SECRET_KEY;
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      'https://nsvosbuxkpnoasfilyqy.supabase.co',
      process.env.SUPABASE_SERVICE_KEY
    );

    // Récupérer la réservation
    const { data: resa, error: resaErr } = await supabase
      .from('reservations').select('*').eq('id', reservation_id).single();
    if(resaErr || !resa) return res.status(404).json({error: 'Réservation introuvable'});

    const commission_annulation = role === 'loueur' ? 10 : 8;
    const prix_total = resa.prix_total || 0;

    // Si pas de paiement Stripe — juste annuler
    if(!resa.stripe_payment_id){
      await supabase.from('reservations').update({statut:'annulee',commission_annulation}).eq('id',reservation_id);
      return res.status(200).json({success:true, remboursement:0, retenu:0});
    }

    // Montant à rembourser en centimes
    // Locataire annule → 92% remboursé, 8% retenus
    // Loueur annule → 100% remboursé au locataire
    const taux = role === 'locataire' ? 0.92 : 1.0;
    const montant_rembourse_centimes = Math.round(prix_total * taux * 100);
    const montant_retenu = +(prix_total * (commission_annulation / 100)).toFixed(2);

    // Récupérer la liste des charges liées au PaymentIntent
    const chargesRes = await fetch(
      `https://api.stripe.com/v1/charges?payment_intent=${resa.stripe_payment_id}&limit=1`,
      { headers: { 'Authorization': 'Bearer ' + secret } }
    );
    const chargesData = await chargesRes.json();
    console.log('Charges:', JSON.stringify(chargesData));

    if(!chargesData.data || !chargesData.data.length){
      // Pas de charge trouvée — annuler sans remboursement Stripe
      await supabase.from('reservations').update({statut:'annulee',commission_annulation}).eq('id',reservation_id);
      return res.status(200).json({success:true, remboursement:0, retenu:0, note:'Aucune charge Stripe trouvée'});
    }

    const chargeId = chargesData.data[0].id;
    console.log('Charge ID:', chargeId, 'Montant à rembourser:', montant_rembourse_centimes);

    // Faire le remboursement partiel
    const refundParams = new URLSearchParams({
      charge: chargeId,
      amount: montant_rembourse_centimes.toString()
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
    console.log('Refund result:', JSON.stringify(refund));

    if(refund.error){
      console.error('Refund error:', refund.error);
      // Continuer quand même l'annulation Supabase
    }

    // Mettre à jour Supabase
    await supabase.from('reservations').update({
      statut: 'annulee',
      commission_annulation
    }).eq('id', reservation_id);

    return res.status(200).json({
      success: true,
      remboursement: (montant_rembourse_centimes / 100).toFixed(2),
      retenu: montant_retenu.toFixed(2),
      refund_id: refund.id || null
    });

  } catch(err){
    console.error('Cancel error:', err);
    return res.status(500).json({error: err.message});
  }
};
