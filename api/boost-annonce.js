// api/boost-annonce.js — Paiement Stripe pour mise en avant
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});

  try {
    const { annonce_id, duree, user_id } = req.body;
    // duree : 1, 7, ou 30 (jours)
    if(!annonce_id || !duree || !user_id) return res.status(400).json({error: 'Paramètres manquants'});

    const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
    const SUPA_URL = 'https://nsvosbuxkpnoasfilyqy.supabase.co';
    const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

    // Prix selon durée
    const prix = { 1: 200, 7: 900, 30: 2900 }; // en centimes
    const labels = { 1: '1 jour', 7: '7 jours', 30: '30 jours' };
    const montant = prix[duree];
    if(!montant) return res.status(400).json({error: 'Durée invalide'});

    // Vérifier que l'annonce appartient à l'utilisateur
    const annRes = await fetch(`${SUPA_URL}/rest/v1/annonces?id=eq.${annonce_id}&user_id=eq.${user_id}&select=id,titre`, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY }
    });
    const annData = await annRes.json();
    if(!annData || annData.length === 0) return res.status(403).json({error: 'Annonce introuvable ou non autorisée'});

    const titre = annData[0].titre || 'votre annonce';

    // Créer PaymentIntent Stripe
    const body = new URLSearchParams({
      amount: montant.toString(),
      currency: 'eur',
      'metadata[annonce_id]': annonce_id,
      'metadata[user_id]': user_id,
      'metadata[duree]': duree.toString(),
      'metadata[type]': 'boost',
      description: `Mise en avant kiloue.com — ${titre} — ${labels[duree]}`
    });

    const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });
    const pi = await piRes.json();
    if(pi.error) return res.status(400).json({error: pi.error.message});

    return res.status(200).json({
      client_secret: pi.client_secret,
      montant: (montant / 100).toFixed(2),
      duree: labels[duree]
    });

  } catch(err) {
    console.error('Boost error:', err);
    return res.status(500).json({error: err.message});
  }
};
