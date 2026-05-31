// ============================================
// KILOUE.COM - Configuration Supabase
// ============================================

const SUPABASE_URL = 'https://nsvosbuxkpnoasfilyqy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zdm9zYnV4a3Bub2FzZmlseXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxODczOTcsImV4cCI6MjA5NTc2MzM5N30.pTuH4X8IQy0UJq8zUZ8t7I2WLMEUXae_8nWdtIFrpRE';

// Initialisation du client Supabase
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// AUTH - Fonctions d'authentification
// ============================================

// Inscription
async function inscrireUtilisateur(email, motDePasse, prenom, nom, telephone) {
  const { data, error } = await db.auth.signUp({
    email,
    password: motDePasse,
    options: {
      data: { prenom, nom, telephone }
    }
  });
  if (error) throw error;
  return data;
}

// Connexion
async function connecterUtilisateur(email, motDePasse) {
  const { data, error } = await db.auth.signInWithPassword({ email, password: motDePasse });
  if (error) throw error;
  return data;
}

// Déconnexion
async function deconnecterUtilisateur() {
  const { error } = await db.auth.signOut();
  if (error) throw error;
}

// Utilisateur connecté
async function getUtilisateurConnecte() {
  const { data: { user } } = await db.auth.getUser();
  return user;
}

// ============================================
// ANNONCES
// ============================================

// Créer une annonce
async function creerAnnonce(annonce) {
  const user = await getUtilisateurConnecte();
  if (!user) throw new Error('Vous devez être connecté');
  const { data, error } = await db
    .from('annonces')
    .insert([{ ...annonce, user_id: user.id }])
    .select();
  if (error) throw error;
  return data[0];
}

// Récupérer toutes les annonces
async function getAnnonces(filtres = {}) {
  let query = db.from('annonces').select(`
    *,
    utilisateurs (prenom, nom, ville, est_certifie, avatar_url)
  `).eq('disponible', true);

  if (filtres.categorie) query = query.eq('categorie', filtres.categorie);
  if (filtres.ville) query = query.eq('ville', filtres.ville);
  if (filtres.prixMax) query = query.lte('prix_jour', filtres.prixMax);
  if (filtres.prixMin) query = query.gte('prix_jour', filtres.prixMin);
  if (filtres.recherche) query = query.ilike('titre', `%${filtres.recherche}%`);

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// Récupérer une annonce par ID
async function getAnnonce(id) {
  const { data, error } = await db
    .from('annonces')
    .select(`*, utilisateurs (prenom, nom, ville, est_certifie, avatar_url, telephone)`)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// Mes annonces
async function getMesAnnonces() {
  const user = await getUtilisateurConnecte();
  if (!user) throw new Error('Vous devez être connecté');
  const { data, error } = await db
    .from('annonces')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Modifier une annonce
async function modifierAnnonce(id, mises_a_jour) {
  const { data, error } = await db
    .from('annonces')
    .update(mises_a_jour)
    .eq('id', id)
    .select();
  if (error) throw error;
  return data[0];
}

// Supprimer une annonce
async function supprimerAnnonce(id) {
  const { error } = await db.from('annonces').delete().eq('id', id);
  if (error) throw error;
}

// ============================================
// PHOTOS - Upload vers Supabase Storage
// ============================================

async function uploadPhoto(fichier, dossier = 'annonces-photos') {
  const user = await getUtilisateurConnecte();
  if (!user) throw new Error('Vous devez être connecté');
  const nomFichier = `${user.id}/${Date.now()}-${fichier.name}`;
  const { data, error } = await db.storage
    .from(dossier)
    .upload(nomFichier, fichier, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data: { publicUrl } } = db.storage.from(dossier).getPublicUrl(nomFichier);
  return publicUrl;
}

// ============================================
// MESSAGES
// ============================================

async function envoyerMessage(destinataire_id, annonce_id, contenu) {
  const user = await getUtilisateurConnecte();
  if (!user) throw new Error('Vous devez être connecté');
  const { data, error } = await db.from('messages').insert([{
    expediteur_id: user.id,
    destinataire_id,
    annonce_id,
    contenu
  }]).select();
  if (error) throw error;
  return data[0];
}

async function getMessages(annonce_id, autre_user_id) {
  const user = await getUtilisateurConnecte();
  if (!user) throw new Error('Vous devez être connecté');
  const { data, error } = await db
    .from('messages')
    .select(`*, expediteur:utilisateurs!expediteur_id(prenom, avatar_url)`)
    .eq('annonce_id', annonce_id)
    .or(`expediteur_id.eq.${user.id},destinataire_id.eq.${user.id}`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

async function getConversations() {
  const user = await getUtilisateurConnecte();
  if (!user) throw new Error('Vous devez être connecté');
  const { data, error } = await db
    .from('messages')
    .select(`*, annonces(titre, photos), expediteur:utilisateurs!expediteur_id(prenom, avatar_url)`)
    .or(`expediteur_id.eq.${user.id},destinataire_id.eq.${user.id}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ============================================
// RÉSERVATIONS
// ============================================

async function creerReservation(reservation) {
  const user = await getUtilisateurConnecte();
  if (!user) throw new Error('Vous devez être connecté');
  const { data, error } = await db
    .from('reservations')
    .insert([{ ...reservation, locataire_id: user.id }])
    .select();
  if (error) throw error;
  return data[0];
}

async function getMesReservations() {
  const user = await getUtilisateurConnecte();
  if (!user) throw new Error('Vous devez être connecté');
  const { data, error } = await db
    .from('reservations')
    .select(`*, annonces(titre, photos, prix_jour), locataire:utilisateurs!locataire_id(prenom, avatar_url)`)
    .or(`loueur_id.eq.${user.id},locataire_id.eq.${user.id}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function updateStatutReservation(id, statut) {
  const { data, error } = await db
    .from('reservations')
    .update({ statut })
    .eq('id', id)
    .select();
  if (error) throw error;
  return data[0];
}

// ============================================
// PROFIL UTILISATEUR
// ============================================

async function getMonProfil() {
  const user = await getUtilisateurConnecte();
  if (!user) return null;
  const { data, error } = await db
    .from('utilisateurs')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) throw error;
  return data;
}

async function updateProfil(mises_a_jour) {
  const user = await getUtilisateurConnecte();
  if (!user) throw new Error('Vous devez être connecté');
  const { data, error } = await db
    .from('utilisateurs')
    .update(mises_a_jour)
    .eq('id', user.id)
    .select();
  if (error) throw error;
  return data[0];
}

// ============================================
// UTILITAIRES
// ============================================

// Vérifier si connecté et rediriger sinon
async function requireAuth(redirectUrl = 'inscription.html') {
  const user = await getUtilisateurConnecte();
  if (!user) {
    window.location.href = redirectUrl;
    return null;
  }
  return user;
}

// Calculer commission kiloue (5%)
function calculerCommission(montant) {
  return parseFloat((montant * 0.05).toFixed(2));
}

// Formater prix
function formatPrix(prix) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(prix);
}

console.log('✅ Supabase kiloue initialisé');
