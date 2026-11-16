# Spécification de Sécurité Firestore — SuguPay (Gestion Commerciale Mali)

## 1. Invariants de Données (Data Invariants)

1. **Isolation stricte des boutiques (Tenant Isolation)** : Aucun document appartenant à `/shops/{shopId}/...` ne peut être lu ou modifié par un utilisateur qui n'est pas membre actif (`active == true`) de cette boutique dans `/shops/{shopId}/members/{uid}`.
2. **Intégrité d'identité** : `users/{userId}` est strictement privé au propriétaire `request.auth.uid == userId`. L'`ownerId` d'une boutique et l'`uid` d'un membre sont immuables après création.
3. **Intégrité temporelle** : Tous les horodatages `createdAt` doivent égaler `request.time` lors de la création, et `updatedAt` doit égaler `request.time` lors des mises à jour.
4. **Anti-auto-élévation de privilèges** : Un membre non-admin/non-owner ne peut jamais modifier son propre rôle ou ses permissions, ni s'ajouter à une boutique sans invitation vérifiée ou création initiale de sa propre boutique.
5. **Contraintes volumétriques et de schéma** : Toutes les chaînes ont des bornes strictes `.size() <= MAX`, les listes sont bornées (`<= 50` lignes par vente/achat, `<= 20` permissions), et `keys().hasOnly(...)` empêche l'injection de champs fantômes.
6. **Vérification Email** : Toute écriture exige `request.auth.token.email_verified == true`.
7. **Cohérence atomique** : La création d'une boutique exige l'existence simultanée du document membre propriétaire via `existsAfter` / `getAfter`.

## 2. Les 12 Payloads Adversariaux ("Dirty Dozen")

1. **Shadow Field Injection** : Création d'un produit avec `{ ..., isAdmin: true, secret: "x" }` -> Rejeté par `keys().hasOnly(...)`.
2. **Email Spoofing sans vérification** : Création d'une vente avec `email_verified: false` -> Rejeté par `isVerifiedUser()`.
3. **PII Blanket Read** : Lecture de `/users/{otherUserId}` par un utilisateur authentifié différent -> Rejeté (`request.auth.uid == userId`).
4. **Cross-Tenant List Scraping** : `list` sur `/shops/{otherShopId}/sales` par un utilisateur non membre -> Rejeté par `isActiveMember(shopId)`.
5. **Privilege Escalation (Self-Role Update)** : Un caissier tente d'update `/shops/{shopId}/members/{uid}` avec `role: "owner"` -> Rejeté par `isShopAdmin(shopId)` et blocage de modification du rôle par non-admin.
6. **ID Poisoning** : Création d'un document avec un ID contenant 1500 caractères ou des caractères spéciaux `../admin` -> Rejeté par `isValidId()`.
7. **Timestamp Forgery** : Création d'une vente avec `createdAt` antidaté à l'année dernière -> Rejeté par `incoming().createdAt == request.time`.
8. **Immutability Violation** : Modification de `ownerId` sur `/shops/{shopId}` ou `createdAt` sur une facture -> Rejeté par `incoming().ownerId == existing().ownerId`.
9. **Terminal State Tampering** : Modification d'une vente au statut `'cancelled'` par un non-admin -> Rejeté par le verrou d'état terminal.
10. **Negative Financial Poisoning** : Création d'une dépense avec `amount: -50000` -> Rejeté par `data.amount > 0`.
11. **Unbounded Array / DoS** : Envoi d'une vente avec 1000 articles ou un titre de 50KB -> Rejeté par `data.items.size() <= 50` et `data.name.size() <= 140`.
12. **Invite Hijacking** : Acceptation d'une invitation destinée à `autre@gmail.com` par `attaquant@gmail.com` -> Rejeté par `resource.data.email == request.auth.token.email`.
