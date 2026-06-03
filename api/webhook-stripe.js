// api/webhook-stripe.js — Vercel Function
// Reçoit les événements Stripe et met à jour Supabase

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Import Supabase
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://nsvosbuxkpnoasfilyqy.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zdm9zYnV4a3Bub2FzZmlseXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxODczOTcsImV4cCI6MjA5NTc2MzM5N30.pTuH4X8IQy0UJq8zUZ8t7I2WLMEUXae_8nWdtIFrpRE'
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if(req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if(webhookSecret && sig){
      // Vérification signature (production)
      const rawBody = await getRawBody(req);
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } else {
      // Mode test sans vérification signature
      event = req.body;
    }
  } catch(err){
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({error: 'Webhook Error: '+err.message});
  }

  // Traitement des événements
  if(event.type === 'payment_intent.succeeded'){
    const pi = event.data.object;
    const reservationId = pi.metadata?.reservation_id;

    if(reservationId){
      // Marquer la réservation comme payée
      const { error } = await supabase
        .from('reservations')
        .update({
          statut: 'payee',
          stripe_payment_id: pi.id,
          paye_le: new Date().toISOString()
        })
        .eq('id', reservationId);

      if(error) console.error('Supabase update error:', error);
      else console.log('Réservation', reservationId, 'marquée payée');
    }
  }

  if(event.type === 'payment_intent.payment_failed'){
    const pi = event.data.object;
    const reservationId = pi.metadata?.reservation_id;
    if(reservationId){
      await supabase
        .from('reservations')
        .update({ statut: 'paiement_echoue' })
        .eq('id', reservationId);
    }
  }

  return res.status(200).json({received: true});
};

// Helper pour lire le body brut (nécessaire pour la vérification Stripe)
async function getRawBody(req){
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
