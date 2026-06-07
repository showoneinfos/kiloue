// api/cancel-payment.js — Sans aucun package npm, fetch natif uniquement
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { reservation_id, role } = req.body;
    if (!reservation_id || !role) return res.status(400).json({ error: 'Paramètres manquants' });

    const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
    const SUPA_URL = 'https://nsvosbuxkpnoasfilyqy.supabase.co';
    const SUPA_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    // 1. Récupérer la réservation
    const resaRes = await fetch(
      `${SUPA_URL}/rest/v1/reservations?id=eq.${reservation_id}&select=*`,
      {
        headers: {
          'apikey': SUPA_SERVICE_KEY,
          'Authorization': 'Bearer ' + SUPA_SERVICE_KEY
        }
      }
    );
    const resaData = await resaRes.json();
    const resa = resaData[0];
    if (!resa) return res.status(404).json({ error: 'Réservation introuvable' });

    const prix_total = resa.prix_total || 0;

    // 2. Calcul du remboursement
    // - Locataire annule : remboursé à 75% (25% retenus : 20% loueur + 5% kiloue)
    // - Loueur annule    : remboursé à 100%, aucune pénalité
    const taux_remboursement = role === 'locataire' ? 0.75 : 1.0;
    const montant_centimes = Math.round(prix_total * taux_remboursement * 100);

    // commission_annulation : 25 si locataire annule, 0 si loueur annule
    const commission_annulation = role === 'locataire' ? 25 : 0;
    const montant_retenu = role === 'locataire'
      ? +(prix_total * 0.25).toFixed(2)
      : 0;

    // 3. Si pas de paiement Stripe — juste annuler dans Supabase
    if (!resa.stripe_payment_id) {
      await fetch(`${SUPA_URL}/rest/v1/reservations?id=eq.${reservation_id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPA_SERVICE_KEY,
          'Authorization': 'Bearer ' + SUPA_SERVICE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ statut: 'annulee', commission_annulation })
      });
      return res.status(200).json({ success: true, remboursement: 0, retenu: 0 });
    }

    // 4. Récupérer la charge Stripe
    const chargesRes = await fetch(
      `https://api.stripe.com/v1/charges?payment_intent=${resa.stripe_payment_id}&limit=1`,
      { headers: { 'Authorization': 'Bearer ' + STRIPE_KEY } }
    );
    const chargesData = await chargesRes.json();

    let refundResult = null;
    if (chargesData.data && chargesData.data.length > 0) {
      const charge = chargesData.data[0];

      const deja_rembourse = charge.amount_refunded || 0;
      const encaisse = charge.amount || 0;
      const remboursable = encaisse - deja_rembourse;
      const a_rembourser = Math.min(montant_centimes, remboursable);

      if (a_rembourser <= 0) {
        return res.status(400).json({ error: 'Déjà entièrement remboursé' });
      }

      // 5. Remboursement partiel Stripe
      const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + STRIPE_KEY,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          charge: charge.id,
          amount: a_rembourser.toString()
        }).toString()
      });
      refundResult = await refundRes.json();
    }

    // 6. Mettre à jour Supabase
    await fetch(`${SUPA_URL}/rest/v1/reservations?id=eq.${reservation_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPA_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPA_SERVICE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ statut: 'annulee', commission_annulation })
    });

    return res.status(200).json({
      success: true,
      remboursement: (montant_centimes / 100).toFixed(2),
      retenu: montant_retenu.toFixed(2),
      refund_id: refundResult?.id || null,
      refund_error: refundResult?.error?.message || null
    });

  } catch (err) {
    console.error('Cancel error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
