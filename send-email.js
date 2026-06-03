// api/send-email.js — Vercel Function
// Envoie des emails via Resend

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});

  try {
    const { type, to, data } = req.body;
    if(!type || !to) return res.status(400).json({error: 'Paramètres manquants'});

    const RESEND_KEY = process.env.RESEND_API_KEY;
    let subject = '';
    let html = '';

    const baseStyle = `
      font-family: Inter, Arial, sans-serif;
      max-width: 560px;
      margin: 0 auto;
      background: #ffffff;
    `;
    const headerStyle = `
      background: #00A693;
      padding: 24px 32px;
      border-radius: 10px 10px 0 0;
    `;
    const bodyStyle = `
      padding: 28px 32px;
      border: 1px solid #E5E5E5;
      border-top: none;
      border-radius: 0 0 10px 10px;
    `;
    const btnStyle = `
      display: inline-block;
      padding: 13px 28px;
      background: #00A693;
      color: #ffffff;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 15px;
      margin-top: 20px;
    `;
    const footerStyle = `
      text-align: center;
      padding: 16px;
      font-size: 12px;
      color: #999;
    `;

    // ── TYPE 1 : Nouvelle réservation pour le loueur ──
    if(type === 'nouvelle_reservation'){
      subject = '📅 Nouvelle demande de réservation — kiloue.com';
      html = `<div style="${baseStyle}">
        <div style="${headerStyle}">
          <img src="https://kiloue.vercel.app/favicon.ico" width="32" style="margin-bottom:8px;"><br>
          <span style="color:#fff;font-size:20px;font-weight:700;">kiloue.com</span>
        </div>
        <div style="${bodyStyle}">
          <h2 style="color:#1A1A1A;margin-bottom:8px;">Nouvelle demande de réservation !</h2>
          <p style="color:#666;line-height:1.7;margin-bottom:16px;">
            Bonjour ${data.loueur_prenom || 'Loueur'},<br><br>
            <strong>${data.locataire_nom || 'Un locataire'}</strong> souhaite réserver votre annonce :
          </p>
          <div style="background:#F5F5F5;border-radius:8px;padding:16px;margin-bottom:20px;">
            <div style="font-size:16px;font-weight:600;color:#1A1A1A;margin-bottom:8px;">${data.annonce_titre || ''}</div>
            <div style="color:#666;font-size:14px;">Du <strong>${data.date_debut || ''}</strong> au <strong>${data.date_fin || ''}</strong></div>
            <div style="color:#00A693;font-size:18px;font-weight:700;margin-top:8px;">+${data.montant_net || ''}€ pour vous</div>
          </div>
          <p style="color:#666;font-size:14px;margin-bottom:20px;">
            Connectez-vous à votre espace pour accepter ou refuser cette demande.
          </p>
          <a href="https://kiloue.vercel.app/profil.html" style="${btnStyle}">
            Voir la demande →
          </a>
        </div>
        <div style="${footerStyle}">
          kiloue.com · Location de matériel entre particuliers<br>
          <a href="https://kiloue.vercel.app" style="color:#00A693;">kiloue.vercel.app</a>
        </div>
      </div>`;
    }

    // ── TYPE 2 : Réservation acceptée — lien de paiement ──
    else if(type === 'reservation_acceptee'){
      subject = '✅ Votre réservation a été acceptée — Finalisez le paiement';
      html = `<div style="${baseStyle}">
        <div style="${headerStyle}">
          <span style="color:#fff;font-size:20px;font-weight:700;">kiloue.com</span>
        </div>
        <div style="${bodyStyle}">
          <h2 style="color:#1A1A1A;margin-bottom:8px;">Bonne nouvelle !</h2>
          <p style="color:#666;line-height:1.7;margin-bottom:16px;">
            Bonjour ${data.locataire_prenom || ''},<br><br>
            Le loueur a accepté votre demande de réservation pour :
          </p>
          <div style="background:#E8F7F5;border-radius:8px;padding:16px;margin-bottom:20px;">
            <div style="font-size:16px;font-weight:600;color:#1A1A1A;margin-bottom:8px;">${data.annonce_titre || ''}</div>
            <div style="color:#666;font-size:14px;">Du <strong>${data.date_debut || ''}</strong> au <strong>${data.date_fin || ''}</strong></div>
            <div style="color:#00A693;font-size:18px;font-weight:700;margin-top:8px;">${data.montant_total || ''}€</div>
          </div>
          <p style="color:#666;font-size:14px;margin-bottom:4px;">
            Pour confirmer définitivement votre réservation, procédez au paiement sécurisé :
          </p>
          <a href="${data.lien_paiement || 'https://kiloue.vercel.app/profil.html'}" style="${btnStyle}">
            Payer maintenant — ${data.montant_total || ''}€
          </a>
          <p style="color:#999;font-size:12px;margin-top:16px;">
            Paiement 100% sécurisé par Stripe. Votre réservation sera confirmée immédiatement après le paiement.
          </p>
        </div>
        <div style="${footerStyle}">
          kiloue.com · <a href="https://kiloue.vercel.app" style="color:#00A693;">kiloue.vercel.app</a>
        </div>
      </div>`;
    }

    // ── TYPE 3 : Paiement confirmé ──
    else if(type === 'paiement_confirme'){
      subject = '🎉 Paiement confirmé — Votre réservation est finalisée !';
      html = `<div style="${baseStyle}">
        <div style="${headerStyle}">
          <span style="color:#fff;font-size:20px;font-weight:700;">kiloue.com</span>
        </div>
        <div style="${bodyStyle}">
          <h2 style="color:#1A1A1A;margin-bottom:8px;">Paiement confirmé !</h2>
          <p style="color:#666;line-height:1.7;margin-bottom:16px;">
            Bonjour ${data.locataire_prenom || ''},<br><br>
            Votre paiement de <strong>${data.montant_total || ''}€</strong> a bien été reçu.
            Votre réservation est maintenant confirmée.
          </p>
          <div style="background:#E8F7F5;border-radius:8px;padding:16px;margin-bottom:20px;">
            <div style="font-size:16px;font-weight:600;color:#1A1A1A;margin-bottom:8px;">${data.annonce_titre || ''}</div>
            <div style="color:#666;font-size:14px;">Du <strong>${data.date_debut || ''}</strong> au <strong>${data.date_fin || ''}</strong></div>
          </div>
          <p style="color:#666;font-size:14px;">Le loueur va vous contacter pour organiser la remise du matériel.</p>
          <a href="https://kiloue.vercel.app/profil.html" style="${btnStyle}">
            Voir mes locations →
          </a>
        </div>
        <div style="${footerStyle}">
          kiloue.com · <a href="https://kiloue.vercel.app" style="color:#00A693;">kiloue.vercel.app</a>
        </div>
      </div>`;
    }

    else {
      return res.status(400).json({error: 'Type email inconnu: ' + type});
    }

    // Envoyer via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'kiloue.com <noreply@kiloue.com>',
        to: [to],
        subject,
        html
      })
    });

    const result = await response.json();
    if(result.error){
      console.error('Resend error:', result.error);
      return res.status(400).json({error: result.error.message});
    }

    return res.status(200).json({success: true, id: result.id});

  } catch(err){
    console.error('Error:', err);
    return res.status(500).json({error: err.message});
  }
};
