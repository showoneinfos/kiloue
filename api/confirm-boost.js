// api/confirm-boost.js — Confirme le boost après paiement Stripe
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});

  try {
    const { payment_intent_id, annonce_id, duree } = req.body;
    if(!payment_intent_id || !annonce_id || !duree) return res.status(400).json({error: 'Paramètres manquants'});

    const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
    const SUPA_URL = 'https://nsvosbuxkpnoasfilyqy.supabase.co';
    const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

    // Vérifier le paiement Stripe
    const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_intent_id}`, {
      headers: { 'Authorization': 'Bearer ' + STRIPE_KEY }
    });
    const pi = await piRes.json();
    if(pi.status !== 'succeeded') return res.status(400).json({error: 'Paiement non confirmé'});

    // Calculer la date d'expiration du boost
    const now = new Date();
    now.setDate(now.getDate() + parseInt(duree));
    const boost_expire = now.toISOString();

    // Mettre à jour Supabase
    await fetch(`${SUPA_URL}/rest/v1/annonces?id=eq.${annonce_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ boost_expire })
    });

    return res.status(200).json({ success: true, boost_expire });

  } catch(err) {
    console.error('Confirm boost error:', err);
    return res.status(500).json({error: err.message});
  }
};
