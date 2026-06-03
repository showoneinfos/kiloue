// api/create-payment.js — Vercel Function
// Crée un PaymentIntent Stripe pour une réservation kiloue

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});

  try {
    const { reservation_id, montant_total, locataire_email, annonce_titre } = req.body;

    if(!reservation_id || !montant_total || !locataire_email){
      return res.status(400).json({error: 'Paramètres manquants'});
    }

    // montant_total est en euros → Stripe attend des centimes
    const montant_centimes = Math.round(montant_total * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount:   montant_centimes,
      currency: 'eur',
      metadata: {
        reservation_id,
        annonce_titre: annonce_titre || '',
        locataire_email
      },
      description: 'Location kiloue.com — ' + (annonce_titre || reservation_id),
      receipt_email: locataire_email,
    });

    return res.status(200).json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id
    });

  } catch(err){
    console.error('Stripe error:', err);
    return res.status(500).json({error: err.message});
  }
};
