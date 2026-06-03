// api/create-payment.js — Vercel Function
// Utilise fetch natif pour appeler l'API Stripe (pas besoin du package stripe)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});

  try {
    const body = req.body;
    const { reservation_id, montant_total, locataire_email, annonce_titre } = body;

    if(!reservation_id || !montant_total){
      return res.status(400).json({error: 'Paramètres manquants'});
    }

    const montant_centimes = Math.round(parseFloat(montant_total) * 100);
    const secret = process.env.STRIPE_SECRET_KEY;

    // Appel direct à l'API Stripe via fetch
    const params = new URLSearchParams({
      amount: montant_centimes,
      currency: 'eur',
      'metadata[reservation_id]': reservation_id,
      'metadata[annonce_titre]': annonce_titre || '',
      description: 'Location kiloue.com — ' + (annonce_titre || reservation_id),
    });
    if(locataire_email) params.append('receipt_email', locataire_email);

    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + secret,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await stripeRes.json();

    if(data.error){
      return res.status(400).json({error: data.error.message});
    }

    return res.status(200).json({
      client_secret: data.client_secret,
      payment_intent_id: data.id
    });

  } catch(err){
    console.error('Error:', err);
    return res.status(500).json({error: err.message});
  }
};
