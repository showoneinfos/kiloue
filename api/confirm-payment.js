// api/confirm-payment.js — Vercel Function
// Met à jour le statut de la réservation après paiement Stripe confirmé

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});

  try {
    const { reservation_id, payment_intent_id } = req.body;
    if(!reservation_id || !payment_intent_id){
      return res.status(400).json({error: 'Paramètres manquants'});
    }

    // Vérifier le paiement auprès de Stripe
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    if(paymentIntent.status !== 'succeeded'){
      return res.status(400).json({error: 'Paiement non confirmé par Stripe'});
    }

    // Vérifier que le reservation_id correspond bien
    if(paymentIntent.metadata.reservation_id !== reservation_id){
      return res.status(400).json({error: 'Réservation non correspondante'});
    }

    // Mettre à jour Supabase avec la clé service (bypass RLS)
    const supabase = createClient(
      'https://nsvosbuxkpnoasfilyqy.supabase.co',
      process.env.SUPABASE_SERVICE_KEY || process.env.STRIPE_SECRET_KEY // fallback
    );

    const { error } = await supabase
      .from('reservations')
      .update({
        statut: 'payee',
        stripe_payment_id: payment_intent_id,
        paye_le: new Date().toISOString()
      })
      .eq('id', reservation_id);

    if(error){
      console.error('Supabase error:', error);
      return res.status(500).json({error: error.message});
    }

    return res.status(200).json({success: true});

  } catch(err){
    console.error('Error:', err);
    return res.status(500).json({error: err.message});
  }
};
