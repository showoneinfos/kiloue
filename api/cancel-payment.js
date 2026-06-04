// api/cancel-payment.js — Sans aucun package npm, fetch natif uniquement

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});

  try {
    const { reservation_id, role } = req.body;
    if(!reservation_id || !role) return res.status(400).json({error: 'Paramètres manquants'});

    const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
    const SUPA_URL = 'https://nsvosbuxkpnoasfilyqy.supabase.co';
    const SUPA_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    // 1. Récupérer la réservation via Supabase REST API
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
    if(!resa) return res.status(404).json({error: 'Réservation introuvable'});

    const commission_annulation = role === 'loueur' ? 10 : 8;
    const prix_total = resa.prix_total || 0;

    // 2. Si pas de paiement Stripe — juste annuler dans Supabase
    if(!resa.stripe_payment_id) {
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

    // 3. Calculer le remboursement
    const taux = role === 'locataire' ? 0.92 : 1.0;
    const montant_centimes = Math.round(prix_total * taux * 100);
    const montant_retenu = +(prix_total * (commission_annulation / 100)).toFixed(2);

    // 4. Récupérer la charge Stripe
    const chargesRes = await fetch(
      `https://api.stripe.com/v1/charges?payment_intent=${resa.stripe_payment_id}&limit=1`,
      { headers: { 'Authorization': 'Bearer ' + STRIPE_KEY } }
    );
    const chargesData = await chargesRes.json();
    
    let refundResult = null;
    if(chargesData.data && chargesData.data.length > 0) {
      const chargeId = chargesData.data[0].id;
      
      // 5. Remboursement partiel Stripe
      const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + STRIPE_KEY,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          charge: chargeId,
          amount: montant_centimes.toString()
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

  } catch(err) {
    console.error('Cancel error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
