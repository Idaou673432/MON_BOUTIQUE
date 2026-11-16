import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { hashSecret } from '../lib/crypto';
import { generateDocId, generateInvoiceCode } from '../lib/format';
import { ROLE_DEFAULT_PERMISSIONS } from '../i18n/translations';
import {
  enqueueOfflineOp,
  getPendingOpsForShop,
  isOfflineNetworkError,
  OfflinePendingOp,
  removePendingOp,
  updatePendingOpError,
} from './offlineSyncService';
import {
  Customer,
  LanguageCode,
  LiquidPaymentMethod,
  PaymentMethod,
  PermissionKey,
  Product,
  PurchaseLineItem,
  RoleId,
  Sale,
  SaleLineItem,
  Shop,
  ShopMember,
  Supplier,
  TreasuryAccountType,
} from '../types';

function clampStr(val: string | undefined | null, max: number): string {
  return (val ?? '').trim().slice(0, max);
}

let activeActor: { uid: string; name: string } | null = null;

export function setCurrentActor(actor: { uid: string; name: string } | null): void {
  activeActor = actor;
}

function getCurrentActor(): { uid: string; name: string } {
  if (activeActor) return activeActor;
  const uid = typeof window !== 'undefined' ? localStorage.getItem('sugupay_member_id') : null;
  const name = typeof window !== 'undefined' ? localStorage.getItem('sugupay_member_name') : null;
  if (!uid) throw new Error('Session utilisateur non active. Veuillez vous connecter.');
  return { uid, name: clampStr(name || 'Utilisateur', 120) };
}

/**
 * Firestore persistentLocalCache queues setDoc/updateDoc/deleteDoc/writeBatch
 * in IndexedDB immediately while offline, but its Promise only resolves once
 * the server acknowledges the write. When offline, unblock the UI after local
 * cache persistence (~120ms) while letting Firestore sync automatically later.
 */
async function commitOfflineAware(promise: Promise<unknown>): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    promise.catch((err) => {
      console.warn('Offline Firestore deferred write notice:', err);
    });
    await Promise.race([
      promise,
      new Promise<void>((resolve) => setTimeout(resolve, 120)),
    ]);
    return;
  }
  await promise;
}

function generateShopCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `SUGU-${num}`;
}

async function generateUniqueShopCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const candidate = generateShopCode();
    try {
      const existing = await getDocs(query(collection(db, 'shops'), where('shopCode', '==', candidate)));
      if (existing.empty) return candidate;
    } catch {
      return candidate;
    }
  }
  return `SUGU-${Date.now().toString().slice(-5)}`;
}

export async function createShopWithOwner(params: {
  name: string;
  city: string;
  address: string;
  phone: string;
  nif: string;
  rccm: string;
  tvaRate: number;
  language: LanguageCode;
  ownerName: string;
  username: string;
  password: string;
  seedStarterCatalog: boolean;
}): Promise<{ shopId: string; memberId: string; shopCode: string }> {
  const shopId = generateDocId('shop');
  const memberId = generateDocId('usr');
  const shopCode = await generateUniqueShopCode();
  const passwordHash = await hashSecret(params.password);
  const cleanUsername = clampStr(params.username.toLowerCase(), 60);
  const cleanOwnerName = clampStr(params.ownerName || 'Gérant', 120);

  setCurrentActor({ uid: memberId, name: cleanOwnerName });

  const path = `shops/${shopId}`;
  try {
    const batch = writeBatch(db);
    const shopRef = doc(db, 'shops', shopId);
    const memberRef = doc(db, 'shops', shopId, 'members', memberId);

    batch.set(shopRef, {
      shopCode,
      name: clampStr(params.name, 120),
      ownerId: memberId,
      address: clampStr(params.address, 200),
      city: clampStr(params.city, 80),
      phone: clampStr(params.phone, 40),
      email: '',
      nif: clampStr(params.nif, 60),
      rccm: clampStr(params.rccm, 60),
      currency: 'XOF',
      tvaRate: Math.max(0, Math.min(30, Number(params.tvaRate) || 0)),
      receiptFooter: 'Merci pour votre confiance ! À bientôt.',
      language: params.language,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(memberRef, {
      shopId,
      uid: memberId,
      username: cleanUsername,
      passwordHash,
      displayName: cleanOwnerName,
      phone: clampStr(params.phone, 40),
      role: 'owner',
      permissions: ROLE_DEFAULT_PERMISSIONS.owner,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();

    const defaultAccounts: { name: string; type: TreasuryAccountType; accountNumber: string; isDefault: boolean }[] = [
      { name: 'Caisse Principale (Espèces)', type: 'cash', accountNumber: 'CAISSE-01', isDefault: true },
      { name: 'Orange Money Mali', type: 'orange_money', accountNumber: params.phone || '+223 70 00 00 00', isDefault: false },
      { name: 'Moov Money (Mobicash)', type: 'moov_money', accountNumber: '+223 60 00 00 00', isDefault: false },
      { name: 'Wave Mali', type: 'wave', accountNumber: '+223 70 00 00 00', isDefault: false },
      { name: 'Banque (BDM / BMS)', type: 'bank', accountNumber: 'ML01-0001', isDefault: false },
    ];

    const accBatch = writeBatch(db);
    for (const acc of defaultAccounts) {
      const accId = generateDocId('acc');
      accBatch.set(doc(db, 'shops', shopId, 'treasury_accounts', accId), {
        shopId,
        name: acc.name,
        type: acc.type,
        accountNumber: clampStr(acc.accountNumber, 60),
        balance: 0,
        isDefault: acc.isDefault,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    accBatch.set(doc(db, 'shops', shopId, 'activity_logs', generateDocId('log')), {
      shopId,
      action: 'CREATION_BOUTIQUE',
      module: 'settings',
      description: `Création de la boutique ${clampStr(params.name, 120)} (${shopCode})`,
      amount: 0,
      referenceId: shopId,
      userId: memberId,
      userName: cleanOwnerName,
      createdAt: serverTimestamp(),
    });

    await accBatch.commit();

    if (params.seedStarterCatalog) {
      await seedMalianStarterCatalog(shopId);
    }

    return { shopId, memberId, shopCode };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function loginWithShopCredentials(params: {
  shopCode: string;
  username: string;
  password: string;
}): Promise<{ shop: Shop; member: ShopMember }> {
  const code = params.shopCode.trim().toUpperCase();
  const user = params.username.trim().toLowerCase();
  const passHash = await hashSecret(params.password);

  try {
    const shopSnap = await getDocs(query(collection(db, 'shops'), where('shopCode', '==', code)));
    if (shopSnap.empty) {
      throw new Error(`Aucune boutique trouvée avec le code "${code}".`);
    }
    const shopDoc = shopSnap.docs[0];
    const shop = { id: shopDoc.id, ...shopDoc.data() } as Shop;

    const membersSnap = await getDocs(
      query(collection(db, 'shops', shop.id, 'members'), where('shopId', '==', shop.id))
    );
    const memberDoc = membersSnap.docs.find((d) => {
      const data = d.data() as ShopMember;
      return data.username.toLowerCase() === user;
    });

    if (!memberDoc) {
      throw new Error('Identifiant utilisateur introuvable dans cette boutique.');
    }

    const member = { id: memberDoc.id, ...memberDoc.data() } as ShopMember;
    if (!member.active) {
      throw new Error("Ce compte utilisateur a été suspendu par l'administrateur.");
    }
    if (member.passwordHash !== passHash) {
      throw new Error('Mot de passe ou code PIN incorrect.');
    }

    return { shop, member };
  } catch (err) {
    if (err instanceof Error && !err.message.toLowerCase().includes('permission')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.LIST, 'shops');
  }
}

export async function verifyMemberPassword(member: ShopMember, password: string): Promise<boolean> {
  const passHash = await hashSecret(password);
  return member.passwordHash === passHash;
}

export async function seedMalianStarterCatalog(shopId: string): Promise<void> {
  const actor = getCurrentActor();
  const path = `shops/${shopId}/products`;
  try {
    const batch = writeBatch(db);
    const categories = [
      { id: generateDocId('cat'), name: 'Alimentation Générale', description: 'Riz, huile, sucre, céréales', color: '#059669' },
      { id: generateDocId('cat'), name: 'Boissons & Lait', description: 'Eau, jus, thé, lait en poudre', color: '#0284c7' },
      { id: generateDocId('cat'), name: 'Téléphonie & Accessoires', description: 'Smartphones, chargeurs, écouteurs', color: '#d97706' },
      { id: generateDocId('cat'), name: 'Hygiène & Entretien', description: 'Savons, détergents, cosmétiques', color: '#7c3aed' },
    ];

    for (const c of categories) {
      batch.set(doc(db, 'shops', shopId, 'categories', c.id), {
        shopId,
        name: c.name,
        description: c.description,
        color: c.color,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const products = [
      { name: 'Riz Brisé Parfumé 50kg', sku: 'RIZ-50', barcode: '6180001001', catIdx: 0, unit: 'Sac 50kg', costPrice: 21500, salePrice: 24000, stock: 28, minStock: 5 },
      { name: 'Huile Dinor Bidon 5L', sku: 'HUI-5L', barcode: '6180001002', catIdx: 0, unit: 'Bidon', costPrice: 5800, salePrice: 6750, stock: 42, minStock: 10 },
      { name: 'Sucre Blanc Cristallisé 50kg', sku: 'SUC-50', barcode: '6180001003', catIdx: 0, unit: 'Sac 50kg', costPrice: 26000, salePrice: 29000, stock: 16, minStock: 4 },
      { name: 'Lait en Poudre Nido 900g', sku: 'LAI-900', barcode: '6180001004', catIdx: 1, unit: 'Boîte', costPrice: 4600, salePrice: 5500, stock: 30, minStock: 6 },
      { name: 'Thé Vert Flecha 250g', sku: 'THE-250', barcode: '6180001005', catIdx: 1, unit: 'Paquet', costPrice: 950, salePrice: 1250, stock: 65, minStock: 15 },
      { name: 'Eau Minérale Diago Pack 12x1.5L', sku: 'EAU-12', barcode: '6180001006', catIdx: 1, unit: 'Pack', costPrice: 1800, salePrice: 2500, stock: 50, minStock: 10 },
      { name: 'Chargeur Rapide USB-C 25W', sku: 'CHG-25W', barcode: '6180001007', catIdx: 2, unit: 'Unité', costPrice: 3000, salePrice: 5000, stock: 19, minStock: 5 },
      { name: 'Smartphone Tecno Spark 128Go', sku: 'TEL-TEC', barcode: '6180001008', catIdx: 2, unit: 'Unité', costPrice: 62000, salePrice: 75000, stock: 7, minStock: 2 },
      { name: 'Écouteurs Sans Fil Bluetooth', sku: 'ECO-BT', barcode: '6180001009', catIdx: 2, unit: 'Unité', costPrice: 4500, salePrice: 7500, stock: 14, minStock: 4 },
      { name: 'Savon Marseille Carton 24pcs', sku: 'SAV-24', barcode: '6180001010', catIdx: 3, unit: 'Carton', costPrice: 6500, salePrice: 8000, stock: 11, minStock: 3 },
      { name: 'Lessive Omo Sachet 1kg', sku: 'OMO-1K', barcode: '6180001011', catIdx: 3, unit: 'Sachet', costPrice: 1100, salePrice: 1500, stock: 3, minStock: 8 },
    ];

    for (const p of products) {
      const cat = categories[p.catIdx];
      const pid = generateDocId('prod');
      batch.set(doc(db, 'shops', shopId, 'products', pid), {
        shopId,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        categoryId: cat.id,
        categoryName: cat.name,
        unit: p.unit,
        costPrice: p.costPrice,
        salePrice: p.salePrice,
        stock: p.stock,
        minStock: p.minStock,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const customers = [
      { name: 'Mamadou Coulibaly', phone: '+223 76 42 18 90', address: 'ACI 2000, Bamako', notes: 'Client grossiste régulier' },
      { name: 'Aminata Traoré', phone: '+223 66 19 54 32', address: 'Badalabougou, Bamako', notes: 'Paiement par Orange Money' },
      { name: 'Ibrahima Keïta', phone: '+223 79 11 22 33', address: 'Hamdallaye, Bamako', notes: 'Boutique partenaire' },
    ];
    for (const c of customers) {
      batch.set(doc(db, 'shops', shopId, 'customers', generateDocId('cust')), {
        shopId,
        name: c.name,
        phone: c.phone,
        address: c.address,
        email: '',
        notes: c.notes,
        creditBalance: 0,
        totalSpent: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const suppliers = [
      { name: 'Grand Moulin du Mali (GMM)', phone: '+223 20 21 44 55', address: 'Zone Industrielle, Bamako', nif: 'NIF-ML-20491' },
      { name: 'Sotuba Distribution SARL', phone: '+223 70 88 99 11', address: 'Sotuba, Bamako', nif: 'NIF-ML-88312' },
    ];
    for (const s of suppliers) {
      batch.set(doc(db, 'shops', shopId, 'suppliers', generateDocId('supp')), {
        shopId,
        name: s.name,
        phone: s.phone,
        address: s.address,
        email: '',
        nif: s.nif,
        debtBalance: 0,
        totalPurchased: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // Add a demo cashier user so the admin can test switching roles
    const cashierId = generateDocId('usr');
    const cashierHash = await hashSecret('1234');
    batch.set(doc(db, 'shops', shopId, 'members', cashierId), {
      shopId,
      uid: cashierId,
      username: 'caisse1',
      passwordHash: cashierHash,
      displayName: 'Awa Diallo (Caisse)',
      phone: '+223 76 10 20 30',
      role: 'cashier',
      permissions: ROLE_DEFAULT_PERMISSIONS.cashier,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'shops', shopId, 'activity_logs', generateDocId('log')), {
      shopId,
      action: 'CATALOGUE_INITIAL',
      module: 'products',
      description: 'Initialisation du catalogue de démarrage (11 produits, 4 catégories, 3 clients, 2 fournisseurs)',
      amount: 0,
      referenceId: shopId,
      userId: actor.uid,
      userName: actor.name,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateShopSettings(
  shopId: string,
  updates: Partial<Pick<Shop, 'name' | 'address' | 'city' | 'phone' | 'email' | 'nif' | 'rccm' | 'tvaRate' | 'receiptFooter' | 'language'>>
): Promise<void> {
  const path = `shops/${shopId}`;
  try {
    const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.name !== undefined) payload.name = clampStr(updates.name, 120);
    if (updates.address !== undefined) payload.address = clampStr(updates.address, 200);
    if (updates.city !== undefined) payload.city = clampStr(updates.city, 80);
    if (updates.phone !== undefined) payload.phone = clampStr(updates.phone, 40);
    if (updates.email !== undefined) payload.email = clampStr(updates.email, 160);
    if (updates.nif !== undefined) payload.nif = clampStr(updates.nif, 60);
    if (updates.rccm !== undefined) payload.rccm = clampStr(updates.rccm, 60);
    if (updates.tvaRate !== undefined) payload.tvaRate = Math.max(0, Math.min(30, Number(updates.tvaRate) || 0));
    if (updates.receiptFooter !== undefined) payload.receiptFooter = clampStr(updates.receiptFooter, 240);
    if (updates.language !== undefined) payload.language = updates.language;

    await commitOfflineAware(updateDoc(doc(db, 'shops', shopId), payload));
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// --- CATEGORIES & PRODUCTS ---
export async function saveCategory(
  shopId: string,
  data: { id?: string; name: string; description?: string; color?: string }
): Promise<string> {
  const catId = data.id || generateDocId('cat');
  const path = `shops/${shopId}/categories/${catId}`;
  try {
    if (data.id) {
      await commitOfflineAware(
        updateDoc(doc(db, 'shops', shopId, 'categories', catId), {
          name: clampStr(data.name, 80),
          description: clampStr(data.description, 200),
          color: clampStr(data.color || '#059669', 30),
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      await commitOfflineAware(
        setDoc(doc(db, 'shops', shopId, 'categories', catId), {
          shopId,
          name: clampStr(data.name, 80),
          description: clampStr(data.description, 200),
          color: clampStr(data.color || '#059669', 30),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }
    return catId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeCategory(shopId: string, categoryId: string): Promise<void> {
  const path = `shops/${shopId}/categories/${categoryId}`;
  try {
    await commitOfflineAware(deleteDoc(doc(db, 'shops', shopId, 'categories', categoryId)));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveProduct(
  shopId: string,
  data: {
    id?: string;
    name: string;
    sku?: string;
    barcode?: string;
    categoryId?: string;
    categoryName?: string;
    unit: string;
    costPrice: number;
    salePrice: number;
    stock: number;
    minStock: number;
    active: boolean;
  }
): Promise<string> {
  const actor = getCurrentActor();
  const productId = data.id || generateDocId('prod');
  const path = `shops/${shopId}/products/${productId}`;
  try {
    if (data.id) {
      await commitOfflineAware(
        updateDoc(doc(db, 'shops', shopId, 'products', productId), {
          name: clampStr(data.name, 140),
          sku: clampStr(data.sku, 60),
          barcode: clampStr(data.barcode, 60),
          categoryId: clampStr(data.categoryId, 128),
          categoryName: clampStr(data.categoryName, 80),
          unit: clampStr(data.unit || 'Unité', 40),
          costPrice: Math.max(0, Number(data.costPrice) || 0),
          salePrice: Math.max(0, Number(data.salePrice) || 0),
          stock: Number(data.stock) || 0,
          minStock: Math.max(0, Number(data.minStock) || 0),
          active: Boolean(data.active),
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      const batch = writeBatch(db);
      const initialStock = Number(data.stock) || 0;
      batch.set(doc(db, 'shops', shopId, 'products', productId), {
        shopId,
        name: clampStr(data.name, 140),
        sku: clampStr(data.sku, 60),
        barcode: clampStr(data.barcode, 60),
        categoryId: clampStr(data.categoryId, 128),
        categoryName: clampStr(data.categoryName, 80),
        unit: clampStr(data.unit || 'Unité', 40),
        costPrice: Math.max(0, Number(data.costPrice) || 0),
        salePrice: Math.max(0, Number(data.salePrice) || 0),
        stock: initialStock,
        minStock: Math.max(0, Number(data.minStock) || 0),
        active: Boolean(data.active),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (initialStock !== 0) {
        batch.set(doc(db, 'shops', shopId, 'stock_movements', generateDocId('mvt')), {
          shopId,
          productId,
          productName: clampStr(data.name, 140),
          type: 'adjustment_in',
          quantity: initialStock,
          previousStock: 0,
          newStock: initialStock,
          referenceId: productId,
          reason: 'Stock initial à la création du produit',
          userId: actor.uid,
          userName: actor.name,
          createdAt: serverTimestamp(),
        });
      }

      batch.set(doc(db, 'shops', shopId, 'activity_logs', generateDocId('log')), {
        shopId,
        action: 'NOUVEAU_PRODUIT',
        module: 'products',
        description: `Ajout produit: ${clampStr(data.name, 140)} (${initialStock} ${clampStr(data.unit || 'Unité', 40)})`,
        amount: Math.max(0, Number(data.salePrice) || 0),
        referenceId: productId,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });

      await commitOfflineAware(batch.commit());
    }
    return productId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeProduct(shopId: string, productId: string): Promise<void> {
  const path = `shops/${shopId}/products/${productId}`;
  try {
    await commitOfflineAware(deleteDoc(doc(db, 'shops', shopId, 'products', productId)));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function updateProductMinStock(
  shopId: string,
  productId: string,
  minStock: number
): Promise<void> {
  const path = `shops/${shopId}/products/${productId}`;
  try {
    await commitOfflineAware(
      updateDoc(doc(db, 'shops', shopId, 'products', productId), {
        minStock: Math.max(0, Math.round(Number(minStock) || 0)),
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function clearAllProductsAndStock(params: {
  shopId: string;
  mode: 'delete_products' | 'zero_stock_only';
  deleteCategories?: boolean;
}): Promise<void> {
  const actor = getCurrentActor();
  const path = `shops/${params.shopId}/products`;
  const ops: ((batch: WriteBatch) => void)[] = [];

  try {
    const [prodSnap, mvtSnap, catSnap] = await Promise.all([
      getDocs(query(collection(db, 'shops', params.shopId, 'products'), where('shopId', '==', params.shopId))),
      getDocs(query(collection(db, 'shops', params.shopId, 'stock_movements'), where('shopId', '==', params.shopId))),
      params.mode === 'delete_products' && params.deleteCategories
        ? getDocs(query(collection(db, 'shops', params.shopId, 'categories'), where('shopId', '==', params.shopId)))
        : Promise.resolve(null),
    ]);

    if (params.mode === 'delete_products') {
      prodSnap.docs.forEach((d) => {
        ops.push((b) => b.delete(d.ref));
      });
      if (catSnap) {
        catSnap.docs.forEach((d) => {
          ops.push((b) => b.delete(d.ref));
        });
      }
    } else {
      prodSnap.docs.forEach((d) => {
        ops.push((b) => b.update(d.ref, { stock: 0, updatedAt: serverTimestamp() }));
      });
    }

    mvtSnap.docs.forEach((d) => {
      ops.push((b) => b.delete(d.ref));
    });

    ops.push((b) =>
      b.set(doc(db, 'shops', params.shopId, 'activity_logs', generateDocId('log')), {
        shopId: params.shopId,
        action: params.mode === 'delete_products' ? 'SUPPRESSION_TOUS_PRODUITS' : 'STOCK_REMIS_A_ZERO',
        module: 'inventory',
        description:
          params.mode === 'delete_products'
            ? `Suppression de tous les produits et du stock (${prodSnap.size} articles)`
            : `Remise à zéro des quantités en stock (${prodSnap.size} articles)`,
        amount: 0,
        referenceId: params.shopId,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      })
    );

    const CHUNK_SIZE = 400;
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const slice = ops.slice(i, i + CHUNK_SIZE);
      slice.forEach((fn) => fn(batch));
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- CUSTOMERS & SUPPLIERS ---
export async function saveCustomer(
  shopId: string,
  data: { id?: string; name: string; phone?: string; address?: string; email?: string; notes?: string }
): Promise<string> {
  const customerId = data.id || generateDocId('cust');
  const path = `shops/${shopId}/customers/${customerId}`;
  try {
    if (data.id) {
      await commitOfflineAware(
        updateDoc(doc(db, 'shops', shopId, 'customers', customerId), {
          name: clampStr(data.name, 120),
          phone: clampStr(data.phone, 40),
          address: clampStr(data.address, 200),
          email: clampStr(data.email, 160),
          notes: clampStr(data.notes, 300),
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      await commitOfflineAware(
        setDoc(doc(db, 'shops', shopId, 'customers', customerId), {
          shopId,
          name: clampStr(data.name, 120),
          phone: clampStr(data.phone, 40),
          address: clampStr(data.address, 200),
          email: clampStr(data.email, 160),
          notes: clampStr(data.notes, 300),
          creditBalance: 0,
          totalSpent: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }
    return customerId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeCustomer(shopId: string, customerId: string): Promise<void> {
  const path = `shops/${shopId}/customers/${customerId}`;
  try {
    await commitOfflineAware(deleteDoc(doc(db, 'shops', shopId, 'customers', customerId)));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveSupplier(
  shopId: string,
  data: { id?: string; name: string; phone?: string; address?: string; email?: string; nif?: string }
): Promise<string> {
  const supplierId = data.id || generateDocId('supp');
  const path = `shops/${shopId}/suppliers/${supplierId}`;
  try {
    if (data.id) {
      await commitOfflineAware(
        updateDoc(doc(db, 'shops', shopId, 'suppliers', supplierId), {
          name: clampStr(data.name, 120),
          phone: clampStr(data.phone, 40),
          address: clampStr(data.address, 200),
          email: clampStr(data.email, 160),
          nif: clampStr(data.nif, 60),
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      await commitOfflineAware(
        setDoc(doc(db, 'shops', shopId, 'suppliers', supplierId), {
          shopId,
          name: clampStr(data.name, 120),
          phone: clampStr(data.phone, 40),
          address: clampStr(data.address, 200),
          email: clampStr(data.email, 160),
          nif: clampStr(data.nif, 60),
          debtBalance: 0,
          totalPurchased: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }
    return supplierId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeSupplier(shopId: string, supplierId: string): Promise<void> {
  const path = `shops/${shopId}/suppliers/${supplierId}`;
  try {
    await commitOfflineAware(deleteDoc(doc(db, 'shops', shopId, 'suppliers', supplierId)));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- POS SALE ATOMIC TRANSACTION ---
export async function createSaleAtomic(params: {
  shopId: string;
  customer?: Customer | null;
  customerNameFallback: string;
  items: SaleLineItem[];
  discount: number;
  tvaRate: number;
  paymentMethod: PaymentMethod;
  accountId?: string;
  amountPaid: number;
  notes?: string;
  _presetSaleId?: string;
  _presetInvoiceNumber?: string;
  _skipOfflineQueue?: boolean;
}): Promise<{ saleId: string; invoiceNumber: string; queuedOffline?: boolean }> {
  const actor = getCurrentActor();
  const saleId = params._presetSaleId || generateDocId('sale');
  const invoiceNumber = params._presetInvoiceNumber || generateInvoiceCode('FAC');
  const path = `shops/${params.shopId}/sales/${saleId}`;

  const subtotal = params.items.reduce((acc, i) => acc + i.lineTotal, 0);
  const discount = Math.max(0, Math.min(subtotal, Number(params.discount) || 0));
  const netBeforeTax = Math.max(0, subtotal - discount);
  const tvaAmount = Math.round(netBeforeTax * ((Number(params.tvaRate) || 0) / 100));
  const total = Math.round(netBeforeTax + tvaAmount);
  const rawPaid =
    params.paymentMethod === 'credit' ? Math.max(0, Number(params.amountPaid) || 0) : Math.max(0, Number(params.amountPaid));
  const amountPaid = Math.min(total, rawPaid);
  const amountDue = Math.max(0, total - amountPaid);

  if (amountDue > 0 && !params.customer) {
    throw new Error('Veuillez sélectionner un client enregistré pour une vente à crédit ou paiement partiel.');
  }

  const queueSaleOffline = async () => {
    await enqueueOfflineOp({
      id: saleId,
      shopId: params.shopId,
      opType: 'create_sale',
      label: `Vente ${invoiceNumber} · ${params.customer ? params.customer.name : params.customerNameFallback}`,
      amount: total,
      actor,
      createdAtIso: new Date().toISOString(),
      retryCount: 0,
      payload: {
        type: 'create_sale',
        saleId,
        invoiceNumber,
        customer: params.customer || null,
        customerNameFallback: params.customerNameFallback,
        items: params.items,
        discount,
        tvaRate: params.tvaRate,
        paymentMethod: params.paymentMethod,
        accountId: params.accountId,
        amountPaid,
        notes: params.notes,
      },
    });
    return { saleId, invoiceNumber, queuedOffline: true };
  };

  if (!params._skipOfflineQueue && typeof navigator !== 'undefined' && !navigator.onLine) {
    return queueSaleOffline();
  }

  try {
    await runTransaction(db, async (tx) => {
      const saleRef = doc(db, 'shops', params.shopId, 'sales', saleId);
      if (params._presetSaleId) {
        const existingSale = await tx.get(saleRef);
        if (existingSale.exists()) return;
      }

      const productSnaps = await Promise.all(
        params.items.map((item) => tx.get(doc(db, 'shops', params.shopId, 'products', item.productId)))
      );

      const customerRef = params.customer
        ? doc(db, 'shops', params.shopId, 'customers', params.customer.id)
        : null;
      const customerSnap = customerRef ? await tx.get(customerRef) : null;

      const subtotal = params.items.reduce((acc, i) => acc + i.lineTotal, 0);
      const discount = Math.max(0, Math.min(subtotal, Number(params.discount) || 0));
      const netBeforeTax = Math.max(0, subtotal - discount);
      const tvaAmount = Math.round(netBeforeTax * ((Number(params.tvaRate) || 0) / 100));
      const total = Math.round(netBeforeTax + tvaAmount);

      const rawPaid =
        params.paymentMethod === 'credit' ? Math.max(0, Number(params.amountPaid) || 0) : Math.max(0, Number(params.amountPaid));
      const amountPaid = Math.min(total, rawPaid);
      const amountDue = Math.max(0, total - amountPaid);

      if (amountDue > 0 && !params.customer) {
        throw new Error('Veuillez sélectionner un client enregistré pour une vente à crédit ou paiement partiel.');
      }

      const accountRef =
        amountPaid > 0 && params.accountId
          ? doc(db, 'shops', params.shopId, 'treasury_accounts', params.accountId)
          : null;
      const accountSnap = accountRef ? await tx.get(accountRef) : null;

      if (amountPaid > 0 && (!accountSnap || !accountSnap.exists())) {
        throw new Error('Compte de trésorerie introuvable pour encaisser le paiement.');
      }

      let totalCost = 0;
      const stockUpdates: {
        ref: ReturnType<typeof doc>;
        prevStock: number;
        newStock: number;
        item: SaleLineItem;
      }[] = [];

      for (let idx = 0; idx < params.items.length; idx++) {
        const snap = productSnaps[idx];
        const item = params.items[idx];
        if (!snap.exists()) {
          throw new Error(`Produit introuvable : ${item.productName}`);
        }
        const prod = snap.data() as Product;
        if (prod.stock < item.quantity) {
          throw new Error(`Stock insuffisant pour "${prod.name}" (Disponible : ${prod.stock})`);
        }
        const prevStock = Number(prod.stock);
        const newStock = prevStock - item.quantity;
        totalCost += (Number(prod.costPrice) || 0) * item.quantity;
        stockUpdates.push({
          ref: snap.ref,
          prevStock,
          newStock,
          item: { ...item, costPrice: Number(prod.costPrice) || 0 },
        });
      }

      const status: Sale['status'] =
        amountDue === 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'credit';

      tx.set(doc(db, 'shops', params.shopId, 'sales', saleId), {
        shopId: params.shopId,
        invoiceNumber,
        customerId: params.customer ? params.customer.id : '',
        customerName: clampStr(params.customer ? params.customer.name : params.customerNameFallback, 120),
        customerPhone: clampStr(params.customer?.phone || '', 40),
        items: stockUpdates.map((u) => u.item),
        subtotal,
        discount,
        tvaAmount,
        total,
        totalCost,
        amountPaid,
        amountDue,
        paymentMethod: params.paymentMethod,
        accountId: params.accountId || '',
        status,
        cashierId: actor.uid,
        cashierName: actor.name,
        notes: clampStr(params.notes, 300),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const u of stockUpdates) {
        tx.update(u.ref, {
          stock: u.newStock,
          updatedAt: serverTimestamp(),
        });
        tx.set(doc(db, 'shops', params.shopId, 'stock_movements', generateDocId('mvt')), {
          shopId: params.shopId,
          productId: u.item.productId,
          productName: clampStr(u.item.productName, 140),
          type: 'sale',
          quantity: -u.item.quantity,
          previousStock: u.prevStock,
          newStock: u.newStock,
          referenceId: saleId,
          reason: `Vente ${invoiceNumber}`,
          userId: actor.uid,
          userName: actor.name,
          createdAt: serverTimestamp(),
        });
      }

      if (customerSnap && customerSnap.exists() && customerRef) {
        const custData = customerSnap.data();
        tx.update(customerRef, {
          creditBalance: (Number(custData.creditBalance) || 0) + amountDue,
          totalSpent: (Number(custData.totalSpent) || 0) + total,
          updatedAt: serverTimestamp(),
        });
      }

      if (amountPaid > 0 && accountSnap && accountSnap.exists() && accountRef) {
        const accData = accountSnap.data();
        const balanceAfter = (Number(accData.balance) || 0) + amountPaid;
        tx.update(accountRef, {
          balance: balanceAfter,
          updatedAt: serverTimestamp(),
        });
        tx.set(doc(db, 'shops', params.shopId, 'treasury_transactions', generateDocId('tx')), {
          shopId: params.shopId,
          accountId: accountSnap.id,
          accountName: clampStr(accData.name, 80),
          direction: 'in',
          category: 'sale',
          amount: amountPaid,
          balanceAfter,
          referenceId: saleId,
          description: clampStr(`Encaissement vente ${invoiceNumber}`, 200),
          paymentMethod: params.paymentMethod,
          userId: actor.uid,
          userName: actor.name,
          createdAt: serverTimestamp(),
        });
      }

      tx.set(doc(db, 'shops', params.shopId, 'activity_logs', generateDocId('log')), {
        shopId: params.shopId,
        action: status === 'paid' ? 'VENTE_COMPTANT' : 'VENTE_CREDIT',
        module: 'pos',
        description: clampStr(
          `Vente ${invoiceNumber} · ${params.customer ? params.customer.name : params.customerNameFallback}`,
          240
        ),
        amount: total,
        referenceId: saleId,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });
    });

    return { saleId, invoiceNumber, queuedOffline: false };
  } catch (err) {
    if (!params._skipOfflineQueue && isOfflineNetworkError(err)) {
      return queueSaleOffline();
    }
    if (err instanceof Error && !err.message.toLowerCase().includes('permission')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function cancelSaleAtomic(shopId: string, sale: Sale): Promise<void> {
  const actor = getCurrentActor();
  const path = `shops/${shopId}/sales/${sale.id}`;
  try {
    await runTransaction(db, async (tx) => {
      const saleRef = doc(db, 'shops', shopId, 'sales', sale.id);
      const saleSnap = await tx.get(saleRef);
      if (!saleSnap.exists()) throw new Error('Vente introuvable.');
      const saleData = saleSnap.data() as Sale;
      if (saleData.status === 'cancelled') throw new Error('Cette vente est déjà annulée.');

      const prodSnaps = await Promise.all(
        saleData.items.map((i) => tx.get(doc(db, 'shops', shopId, 'products', i.productId)))
      );
      const customerRef = saleData.customerId
        ? doc(db, 'shops', shopId, 'customers', saleData.customerId)
        : null;
      const customerSnap = customerRef ? await tx.get(customerRef) : null;
      const accountRef =
        saleData.amountPaid > 0 && saleData.accountId
          ? doc(db, 'shops', shopId, 'treasury_accounts', saleData.accountId)
          : null;
      const accountSnap = accountRef ? await tx.get(accountRef) : null;

      tx.update(saleRef, {
        status: 'cancelled',
        amountDue: 0,
        notes: clampStr(`${saleData.notes ? saleData.notes + ' · ' : ''}Annulée par ${actor.name}`, 300),
        updatedAt: serverTimestamp(),
      });

      for (let i = 0; i < saleData.items.length; i++) {
        const pSnap = prodSnaps[i];
        const item = saleData.items[i];
        if (pSnap.exists()) {
          const prevStock = Number(pSnap.data().stock) || 0;
          const newStock = prevStock + item.quantity;
          tx.update(pSnap.ref, { stock: newStock, updatedAt: serverTimestamp() });
          tx.set(doc(db, 'shops', shopId, 'stock_movements', generateDocId('mvt')), {
            shopId,
            productId: item.productId,
            productName: clampStr(item.productName, 140),
            type: 'return',
            quantity: item.quantity,
            previousStock: prevStock,
            newStock,
            referenceId: sale.id,
            reason: clampStr(`Annulation facture ${saleData.invoiceNumber}`, 200),
            userId: actor.uid,
            userName: actor.name,
            createdAt: serverTimestamp(),
          });
        }
      }

      if (customerSnap && customerSnap.exists() && customerRef) {
        const cData = customerSnap.data();
        tx.update(customerRef, {
          creditBalance: Math.max(0, (Number(cData.creditBalance) || 0) - (Number(saleData.amountDue) || 0)),
          totalSpent: Math.max(0, (Number(cData.totalSpent) || 0) - (Number(saleData.total) || 0)),
          updatedAt: serverTimestamp(),
        });
      }

      if (accountSnap && accountSnap.exists() && accountRef && saleData.amountPaid > 0) {
        const aData = accountSnap.data();
        const balanceAfter = (Number(aData.balance) || 0) - Number(saleData.amountPaid);
        tx.update(accountRef, { balance: balanceAfter, updatedAt: serverTimestamp() });
        tx.set(doc(db, 'shops', shopId, 'treasury_transactions', generateDocId('tx')), {
          shopId,
          accountId: accountSnap.id,
          accountName: clampStr(aData.name, 80),
          direction: 'out',
          category: 'sale',
          amount: Number(saleData.amountPaid),
          balanceAfter,
          referenceId: sale.id,
          description: clampStr(`Remboursement annulation ${saleData.invoiceNumber}`, 200),
          paymentMethod: saleData.paymentMethod,
          userId: actor.uid,
          userName: actor.name,
          createdAt: serverTimestamp(),
        });
      }

      tx.set(doc(db, 'shops', shopId, 'activity_logs', generateDocId('log')), {
        shopId,
        action: 'ANNULATION_VENTE',
        module: 'invoices',
        description: clampStr(`Annulation facture ${saleData.invoiceNumber}`, 240),
        amount: Number(saleData.total),
        referenceId: sale.id,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// --- CUSTOMER CREDIT REPAYMENT ---
export async function recordCreditPaymentAtomic(params: {
  shopId: string;
  customer: Customer;
  sale?: Sale | null;
  amount: number;
  paymentMethod: LiquidPaymentMethod;
  accountId: string;
  notes?: string;
  _presetPaymentId?: string;
  _skipOfflineQueue?: boolean;
}): Promise<string> {
  const actor = getCurrentActor();
  const paymentId = params._presetPaymentId || generateDocId('cpay');
  const path = `shops/${params.shopId}/credit_payments/${paymentId}`;
  const amt = Math.max(1, Math.round(Number(params.amount)));

  const queueOffline = async () => {
    await enqueueOfflineOp({
      id: paymentId,
      shopId: params.shopId,
      opType: 'record_credit_payment',
      label: `Remboursement crédit · ${params.customer.name}`,
      amount: amt,
      actor,
      createdAtIso: new Date().toISOString(),
      retryCount: 0,
      payload: {
        type: 'record_credit_payment',
        paymentId,
        customer: params.customer,
        saleId: params.sale?.id,
        invoiceNumber: params.sale?.invoiceNumber,
        saleTotal: params.sale?.total,
        amount: amt,
        paymentMethod: params.paymentMethod,
        accountId: params.accountId,
        accountName: '',
        notes: params.notes,
      },
    });
    return paymentId;
  };

  if (!params._skipOfflineQueue && typeof navigator !== 'undefined' && !navigator.onLine) {
    return queueOffline();
  }

  try {
    await runTransaction(db, async (tx) => {
      const payRef = doc(db, 'shops', params.shopId, 'credit_payments', paymentId);
      if (params._presetPaymentId) {
        const existing = await tx.get(payRef);
        if (existing.exists()) return;
      }

      const custRef = doc(db, 'shops', params.shopId, 'customers', params.customer.id);
      const accRef = doc(db, 'shops', params.shopId, 'treasury_accounts', params.accountId);
      const saleRef = params.sale ? doc(db, 'shops', params.shopId, 'sales', params.sale.id) : null;

      const [custSnap, accSnap, saleSnap] = await Promise.all([
        tx.get(custRef),
        tx.get(accRef),
        saleRef ? tx.get(saleRef) : Promise.resolve(null),
      ]);

      if (!custSnap.exists()) throw new Error('Client introuvable.');
      if (!accSnap.exists()) throw new Error('Compte de trésorerie introuvable.');

      const amt = Math.max(1, Math.round(Number(params.amount)));
      const custData = custSnap.data();
      const accData = accSnap.data();
      const newCreditBalance = Math.max(0, (Number(custData.creditBalance) || 0) - amt);
      const balanceAfter = (Number(accData.balance) || 0) + amt;

      tx.set(doc(db, 'shops', params.shopId, 'credit_payments', paymentId), {
        shopId: params.shopId,
        saleId: params.sale ? params.sale.id : '',
        invoiceNumber: params.sale ? params.sale.invoiceNumber : '',
        customerId: params.customer.id,
        customerName: clampStr(custData.name, 120),
        amount: amt,
        paymentMethod: params.paymentMethod,
        accountId: accSnap.id,
        accountName: clampStr(accData.name, 80),
        recordedBy: actor.uid,
        recordedByName: actor.name,
        notes: clampStr(params.notes, 300),
        createdAt: serverTimestamp(),
      });

      tx.update(custRef, {
        creditBalance: newCreditBalance,
        updatedAt: serverTimestamp(),
      });

      if (saleSnap && saleSnap.exists() && saleRef) {
        const sData = saleSnap.data();
        const newPaid = Math.min(Number(sData.total), (Number(sData.amountPaid) || 0) + amt);
        const newDue = Math.max(0, Number(sData.total) - newPaid);
        tx.update(saleRef, {
          amountPaid: newPaid,
          amountDue: newDue,
          status: newDue === 0 ? 'paid' : 'partial',
          updatedAt: serverTimestamp(),
        });
      }

      tx.update(accRef, {
        balance: balanceAfter,
        updatedAt: serverTimestamp(),
      });

      tx.set(doc(db, 'shops', params.shopId, 'treasury_transactions', generateDocId('tx')), {
        shopId: params.shopId,
        accountId: accSnap.id,
        accountName: clampStr(accData.name, 80),
        direction: 'in',
        category: 'credit_payment',
        amount: amt,
        balanceAfter,
        referenceId: paymentId,
        description: clampStr(
          `Remboursement crédit · ${custData.name}${params.sale ? ` (${params.sale.invoiceNumber})` : ''}`,
          200
        ),
        paymentMethod: params.paymentMethod,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'shops', params.shopId, 'activity_logs', generateDocId('log')), {
        shopId: params.shopId,
        action: 'REMBOURSEMENT_CREDIT',
        module: 'credits',
        description: clampStr(`Remboursement reçu de ${custData.name}`, 240),
        amount: amt,
        referenceId: paymentId,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });
    });

    return paymentId;
  } catch (err) {
    if (!params._skipOfflineQueue && isOfflineNetworkError(err)) {
      return queueOffline();
    }
    if (err instanceof Error && !err.message.toLowerCase().includes('permission')) throw err;
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- DIRECT CUSTOMER DEBT RECORDING FROM POS ---
export async function recordCustomerDebtAtomic(params: {
  shopId: string;
  customer: Customer;
  amount: number;
  amountPaid?: number;
  paymentMethod?: LiquidPaymentMethod;
  accountId?: string;
  reason?: string;
  _presetSaleId?: string;
  _presetInvoiceNumber?: string;
  _skipOfflineQueue?: boolean;
}): Promise<{ saleId: string; invoiceNumber: string; queuedOffline?: boolean }> {
  const actor = getCurrentActor();
  const saleId = params._presetSaleId || generateDocId('debt');
  const invoiceNumber = params._presetInvoiceNumber || generateInvoiceCode('DET');
  const path = `shops/${params.shopId}/sales/${saleId}`;

  const total = Math.round(Number(params.amount) || 0);
  if (total <= 0) {
    throw new Error('Le montant de la dette doit être supérieur à 0 FCFA.');
  }
  if (!params.customer?.id) {
    throw new Error('Veuillez sélectionner un client pour enregistrer sa dette.');
  }

  const amountPaid = Math.max(0, Math.min(total, Math.round(Number(params.amountPaid) || 0)));
  const amountDue = Math.max(0, total - amountPaid);
  const liquidMethod: LiquidPaymentMethod = params.paymentMethod || 'cash';
  const reasonLabel = clampStr(params.reason || 'Dette client enregistrée en caisse', 140);

  if (amountPaid > 0 && !params.accountId) {
    throw new Error("Sélectionnez un compte de trésorerie pour l'avance encaissée.");
  }

  const queueOffline = async () => {
    await enqueueOfflineOp({
      id: saleId,
      shopId: params.shopId,
      opType: 'record_customer_debt',
      label: `Dette client ${invoiceNumber} · ${params.customer.name}`,
      amount: total,
      actor,
      createdAtIso: new Date().toISOString(),
      retryCount: 0,
      payload: {
        type: 'record_customer_debt',
        saleId,
        invoiceNumber,
        customer: params.customer,
        amount: total,
        amountPaid,
        paymentMethod: liquidMethod,
        accountId: params.accountId,
        reason: reasonLabel,
      },
    });
    return { saleId, invoiceNumber, queuedOffline: true };
  };

  if (!params._skipOfflineQueue && typeof navigator !== 'undefined' && !navigator.onLine) {
    return queueOffline();
  }

  try {
    await runTransaction(db, async (tx) => {
      const saleRef = doc(db, 'shops', params.shopId, 'sales', saleId);
      if (params._presetSaleId) {
        const existing = await tx.get(saleRef);
        if (existing.exists()) return;
      }

      const custRef = doc(db, 'shops', params.shopId, 'customers', params.customer.id);
      const accRef =
        amountPaid > 0 && params.accountId
          ? doc(db, 'shops', params.shopId, 'treasury_accounts', params.accountId)
          : null;

      const [custSnap, accSnap] = await Promise.all([
        tx.get(custRef),
        accRef ? tx.get(accRef) : Promise.resolve(null),
      ]);

      if (!custSnap.exists()) throw new Error('Client introuvable.');
      if (amountPaid > 0 && (!accSnap || !accSnap.exists())) {
        throw new Error("Compte de trésorerie introuvable pour l'avance encaissée.");
      }

      const custData = custSnap.data();
      const status: Sale['status'] = amountPaid > 0 ? 'partial' : 'credit';

      const lineItem: SaleLineItem = {
        productId: 'dette_directe',
        productName: reasonLabel,
        unit: 'Dossier',
        quantity: 1,
        unitPrice: total,
        costPrice: total,
        lineTotal: total,
      };

      tx.set(saleRef, {
        shopId: params.shopId,
        invoiceNumber,
        customerId: params.customer.id,
        customerName: clampStr(custData.name || params.customer.name, 120),
        customerPhone: clampStr(custData.phone || params.customer.phone || '', 40),
        items: [lineItem],
        subtotal: total,
        discount: 0,
        tvaAmount: 0,
        total,
        totalCost: total,
        amountPaid,
        amountDue,
        paymentMethod: 'credit',
        accountId: amountPaid > 0 ? params.accountId || '' : '',
        status,
        cashierId: actor.uid,
        cashierName: actor.name,
        notes: clampStr(reasonLabel, 300),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.update(custRef, {
        creditBalance: (Number(custData.creditBalance) || 0) + amountDue,
        totalSpent: (Number(custData.totalSpent) || 0) + total,
        updatedAt: serverTimestamp(),
      });

      if (amountPaid > 0 && accSnap && accSnap.exists() && accRef) {
        const accData = accSnap.data();
        const balanceAfter = (Number(accData.balance) || 0) + amountPaid;
        tx.update(accRef, {
          balance: balanceAfter,
          updatedAt: serverTimestamp(),
        });
        tx.set(doc(db, 'shops', params.shopId, 'treasury_transactions', generateDocId('tx')), {
          shopId: params.shopId,
          accountId: accSnap.id,
          accountName: clampStr(accData.name, 80),
          direction: 'in',
          category: 'sale',
          amount: amountPaid,
          balanceAfter,
          referenceId: saleId,
          description: clampStr(`Avance sur dette ${invoiceNumber} · ${custData.name}`, 200),
          paymentMethod: liquidMethod,
          userId: actor.uid,
          userName: actor.name,
          createdAt: serverTimestamp(),
        });
      }

      tx.set(doc(db, 'shops', params.shopId, 'activity_logs', generateDocId('log')), {
        shopId: params.shopId,
        action: 'DETTE_CLIENT',
        module: 'pos',
        description: clampStr(
          `Dette ${invoiceNumber} · ${custData.name} (${reasonLabel})`,
          240
        ),
        amount: amountDue,
        referenceId: saleId,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });
    });

    return { saleId, invoiceNumber, queuedOffline: false };
  } catch (err) {
    if (!params._skipOfflineQueue && isOfflineNetworkError(err)) {
      return queueOffline();
    }
    if (err instanceof Error && !err.message.toLowerCase().includes('permission')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- PURCHASES & SUPPLIER SUPPLY ---
export async function createPurchaseAtomic(params: {
  shopId: string;
  supplier?: Supplier | null;
  supplierNameFallback: string;
  items: PurchaseLineItem[];
  paymentMethod: PaymentMethod;
  accountId?: string;
  amountPaid: number;
  notes?: string;
  _presetPurchaseId?: string;
  _presetReference?: string;
  _skipOfflineQueue?: boolean;
}): Promise<string> {
  const actor = getCurrentActor();
  const purchaseId = params._presetPurchaseId || generateDocId('pur');
  const reference = params._presetReference || generateInvoiceCode('ACH');
  const path = `shops/${params.shopId}/purchases/${purchaseId}`;

  const total = Math.round(params.items.reduce((acc, i) => acc + i.lineTotal, 0));
  const rawPaid =
    params.paymentMethod === 'credit' ? Math.max(0, Number(params.amountPaid) || 0) : Math.max(0, Number(params.amountPaid));
  const amountPaid = Math.min(total, rawPaid);
  const amountDue = Math.max(0, total - amountPaid);

  if (amountDue > 0 && !params.supplier) {
    throw new Error('Veuillez sélectionner un fournisseur pour un achat à crédit ou partiel.');
  }

  const queueOffline = async () => {
    await enqueueOfflineOp({
      id: purchaseId,
      shopId: params.shopId,
      opType: 'create_purchase',
      label: `Achat ${reference} · ${params.supplier ? params.supplier.name : params.supplierNameFallback}`,
      amount: total,
      actor,
      createdAtIso: new Date().toISOString(),
      retryCount: 0,
      payload: {
        type: 'create_purchase',
        purchaseId,
        reference,
        supplier: params.supplier || null,
        supplierNameFallback: params.supplierNameFallback,
        items: params.items,
        paymentMethod: params.paymentMethod,
        accountId: params.accountId,
        amountPaid,
        notes: params.notes,
      },
    });
    return purchaseId;
  };

  if (!params._skipOfflineQueue && typeof navigator !== 'undefined' && !navigator.onLine) {
    return queueOffline();
  }

  try {
    await runTransaction(db, async (tx) => {
      const purRef = doc(db, 'shops', params.shopId, 'purchases', purchaseId);
      if (params._presetPurchaseId) {
        const existing = await tx.get(purRef);
        if (existing.exists()) return;
      }

      const productSnaps = await Promise.all(
        params.items.map((item) => tx.get(doc(db, 'shops', params.shopId, 'products', item.productId)))
      );
      const supplierRef = params.supplier
        ? doc(db, 'shops', params.shopId, 'suppliers', params.supplier.id)
        : null;
      const supplierSnap = supplierRef ? await tx.get(supplierRef) : null;

      const total = Math.round(params.items.reduce((acc, i) => acc + i.lineTotal, 0));
      const rawPaid =
        params.paymentMethod === 'credit' ? Math.max(0, Number(params.amountPaid) || 0) : Math.max(0, Number(params.amountPaid));
      const amountPaid = Math.min(total, rawPaid);
      const amountDue = Math.max(0, total - amountPaid);

      if (amountDue > 0 && !params.supplier) {
        throw new Error('Veuillez sélectionner un fournisseur pour un achat à crédit ou partiel.');
      }

      const accRef =
        amountPaid > 0 && params.accountId
          ? doc(db, 'shops', params.shopId, 'treasury_accounts', params.accountId)
          : null;
      const accSnap = accRef ? await tx.get(accRef) : null;
      if (amountPaid > 0 && (!accSnap || !accSnap.exists())) {
        throw new Error('Compte de trésorerie introuvable pour régler cet achat.');
      }

      const status = amountDue === 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'credit';

      tx.set(doc(db, 'shops', params.shopId, 'purchases', purchaseId), {
        shopId: params.shopId,
        reference,
        supplierId: params.supplier ? params.supplier.id : '',
        supplierName: clampStr(params.supplier ? params.supplier.name : params.supplierNameFallback, 120),
        items: params.items,
        total,
        amountPaid,
        amountDue,
        paymentMethod: params.paymentMethod,
        accountId: params.accountId || '',
        status,
        recordedBy: actor.uid,
        recordedByName: actor.name,
        notes: clampStr(params.notes, 300),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (let i = 0; i < params.items.length; i++) {
        const snap = productSnaps[i];
        const item = params.items[i];
        if (!snap.exists()) throw new Error(`Produit introuvable: ${item.productName}`);
        const prevStock = Number(snap.data().stock) || 0;
        const newStock = prevStock + item.quantity;
        tx.update(snap.ref, {
          stock: newStock,
          costPrice: item.unitCost,
          updatedAt: serverTimestamp(),
        });
        tx.set(doc(db, 'shops', params.shopId, 'stock_movements', generateDocId('mvt')), {
          shopId: params.shopId,
          productId: item.productId,
          productName: clampStr(item.productName, 140),
          type: 'purchase',
          quantity: item.quantity,
          previousStock: prevStock,
          newStock,
          referenceId: purchaseId,
          reason: `Approvisionnement ${reference}`,
          userId: actor.uid,
          userName: actor.name,
          createdAt: serverTimestamp(),
        });
      }

      if (supplierSnap && supplierSnap.exists() && supplierRef) {
        const sData = supplierSnap.data();
        tx.update(supplierRef, {
          debtBalance: (Number(sData.debtBalance) || 0) + amountDue,
          totalPurchased: (Number(sData.totalPurchased) || 0) + total,
          updatedAt: serverTimestamp(),
        });
      }

      if (amountPaid > 0 && accSnap && accSnap.exists() && accRef) {
        const aData = accSnap.data();
        const balanceAfter = (Number(aData.balance) || 0) - amountPaid;
        tx.update(accRef, { balance: balanceAfter, updatedAt: serverTimestamp() });
        tx.set(doc(db, 'shops', params.shopId, 'treasury_transactions', generateDocId('tx')), {
          shopId: params.shopId,
          accountId: accSnap.id,
          accountName: clampStr(aData.name, 80),
          direction: 'out',
          category: 'purchase',
          amount: amountPaid,
          balanceAfter,
          referenceId: purchaseId,
          description: clampStr(`Achat fournisseur ${reference}`, 200),
          paymentMethod: params.paymentMethod,
          userId: actor.uid,
          userName: actor.name,
          createdAt: serverTimestamp(),
        });
      }

      tx.set(doc(db, 'shops', params.shopId, 'activity_logs', generateDocId('log')), {
        shopId: params.shopId,
        action: 'APPROVISIONNEMENT',
        module: 'purchases',
        description: clampStr(
          `Achat ${reference} · ${params.supplier ? params.supplier.name : params.supplierNameFallback}`,
          240
        ),
        amount: total,
        referenceId: purchaseId,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });
    });

    return purchaseId;
  } catch (err) {
    if (!params._skipOfflineQueue && isOfflineNetworkError(err)) {
      return queueOffline();
    }
    if (err instanceof Error && !err.message.toLowerCase().includes('permission')) throw err;
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function paySupplierDebtAtomic(params: {
  shopId: string;
  supplier: Supplier;
  amount: number;
  paymentMethod: LiquidPaymentMethod;
  accountId: string;
  _presetTxId?: string;
  _skipOfflineQueue?: boolean;
}): Promise<void> {
  const actor = getCurrentActor();
  const path = `shops/${params.shopId}/suppliers/${params.supplier.id}`;
  const txId = params._presetTxId || generateDocId('tx');
  const amt = Math.max(1, Math.round(Number(params.amount)));

  const queueOffline = async () => {
    await enqueueOfflineOp({
      id: txId,
      shopId: params.shopId,
      opType: 'pay_supplier_debt',
      label: `Règlement fournisseur · ${params.supplier.name}`,
      amount: amt,
      actor,
      createdAtIso: new Date().toISOString(),
      retryCount: 0,
      payload: {
        type: 'pay_supplier_debt',
        txId,
        supplier: params.supplier,
        amount: amt,
        paymentMethod: params.paymentMethod,
        accountId: params.accountId,
      },
    });
  };

  if (!params._skipOfflineQueue && typeof navigator !== 'undefined' && !navigator.onLine) {
    await queueOffline();
    return;
  }

  try {
    await runTransaction(db, async (tx) => {
      if (params._presetTxId) {
        const existingTx = await tx.get(doc(db, 'shops', params.shopId, 'treasury_transactions', txId));
        if (existingTx.exists()) return;
      }

      const suppRef = doc(db, 'shops', params.shopId, 'suppliers', params.supplier.id);
      const accRef = doc(db, 'shops', params.shopId, 'treasury_accounts', params.accountId);
      const [suppSnap, accSnap] = await Promise.all([tx.get(suppRef), tx.get(accRef)]);
      if (!suppSnap.exists() || !accSnap.exists()) throw new Error('Fournisseur ou compte introuvable.');

      const sData = suppSnap.data();
      const aData = accSnap.data();
      const newDebt = Math.max(0, (Number(sData.debtBalance) || 0) - amt);
      const balanceAfter = (Number(aData.balance) || 0) - amt;

      tx.update(suppRef, { debtBalance: newDebt, updatedAt: serverTimestamp() });
      tx.update(accRef, { balance: balanceAfter, updatedAt: serverTimestamp() });

      tx.set(doc(db, 'shops', params.shopId, 'treasury_transactions', txId), {
        shopId: params.shopId,
        accountId: accSnap.id,
        accountName: clampStr(aData.name, 80),
        direction: 'out',
        category: 'supplier_payment',
        amount: amt,
        balanceAfter,
        referenceId: params.supplier.id,
        description: clampStr(`Règlement dette fournisseur · ${sData.name}`, 200),
        paymentMethod: params.paymentMethod,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'shops', params.shopId, 'activity_logs', generateDocId('log')), {
        shopId: params.shopId,
        action: 'REGLEMENT_FOURNISSEUR',
        module: 'purchases',
        description: clampStr(`Paiement fournisseur ${sData.name}`, 240),
        amount: amt,
        referenceId: txId,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (!params._skipOfflineQueue && isOfflineNetworkError(err)) {
      await queueOffline();
      return;
    }
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- EXPENSES & OTHER INCOME ---
export async function recordExpenseOrIncomeAtomic(params: {
  shopId: string;
  type: 'expense' | 'other_income';
  category: string;
  title: string;
  amount: number;
  paymentMethod: LiquidPaymentMethod;
  accountId: string;
  notes?: string;
  _presetExpenseId?: string;
  _skipOfflineQueue?: boolean;
}): Promise<string> {
  const actor = getCurrentActor();
  const expenseId = params._presetExpenseId || generateDocId('exp');
  const path = `shops/${params.shopId}/expenses/${expenseId}`;
  const amt = Math.max(1, Math.round(Number(params.amount)));

  const queueOffline = async () => {
    await enqueueOfflineOp({
      id: expenseId,
      shopId: params.shopId,
      opType: 'record_expense',
      label: `${params.type === 'expense' ? 'Dépense' : 'Recette'} · ${params.title}`,
      amount: amt,
      actor,
      createdAtIso: new Date().toISOString(),
      retryCount: 0,
      payload: {
        type: 'record_expense',
        expenseId,
        expenseType: params.type,
        category: params.category,
        title: params.title,
        amount: amt,
        paymentMethod: params.paymentMethod,
        accountId: params.accountId,
        accountName: '',
        notes: params.notes,
      },
    });
    return expenseId;
  };

  if (!params._skipOfflineQueue && typeof navigator !== 'undefined' && !navigator.onLine) {
    return queueOffline();
  }

  try {
    await runTransaction(db, async (tx) => {
      if (params._presetExpenseId) {
        const existingExp = await tx.get(doc(db, 'shops', params.shopId, 'expenses', expenseId));
        if (existingExp.exists()) return;
      }

      const accRef = doc(db, 'shops', params.shopId, 'treasury_accounts', params.accountId);
      const accSnap = await tx.get(accRef);
      if (!accSnap.exists()) throw new Error('Compte de trésorerie introuvable.');

      const aData = accSnap.data();
      const direction = params.type === 'expense' ? 'out' : 'in';
      const balanceAfter =
        direction === 'in'
          ? (Number(aData.balance) || 0) + amt
          : (Number(aData.balance) || 0) - amt;

      tx.set(doc(db, 'shops', params.shopId, 'expenses', expenseId), {
        shopId: params.shopId,
        type: params.type,
        category: clampStr(params.category, 80),
        title: clampStr(params.title, 140),
        amount: amt,
        paymentMethod: params.paymentMethod,
        accountId: accSnap.id,
        accountName: clampStr(aData.name, 80),
        recordedBy: actor.uid,
        recordedByName: actor.name,
        notes: clampStr(params.notes, 300),
        createdAt: serverTimestamp(),
      });

      tx.update(accRef, { balance: balanceAfter, updatedAt: serverTimestamp() });

      tx.set(doc(db, 'shops', params.shopId, 'treasury_transactions', generateDocId('tx')), {
        shopId: params.shopId,
        accountId: accSnap.id,
        accountName: clampStr(aData.name, 80),
        direction,
        category: params.type === 'expense' ? 'expense' : 'other_income',
        amount: amt,
        balanceAfter,
        referenceId: expenseId,
        description: clampStr(`${params.category} · ${params.title}`, 200),
        paymentMethod: params.paymentMethod,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'shops', params.shopId, 'activity_logs', generateDocId('log')), {
        shopId: params.shopId,
        action: params.type === 'expense' ? 'DEPENSE' : 'AUTRE_RECETTE',
        module: 'expenses',
        description: clampStr(`${params.title} (${params.category})`, 240),
        amount: amt,
        referenceId: expenseId,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });
    });

    return expenseId;
  } catch (err) {
    if (!params._skipOfflineQueue && isOfflineNetworkError(err)) {
      return queueOffline();
    }
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- INVENTORY STOCK ADJUSTMENT ---
export async function adjustStockAtomic(params: {
  shopId: string;
  product: Product;
  type: 'adjustment_in' | 'adjustment_out' | 'loss' | 'return';
  quantity: number;
  reason: string;
  _presetMvtId?: string;
  _skipOfflineQueue?: boolean;
}): Promise<void> {
  const actor = getCurrentActor();
  const path = `shops/${params.shopId}/products/${params.product.id}`;
  const mvtId = params._presetMvtId || generateDocId('mvt');
  const qty = Math.max(1, Number(params.quantity) || 0);

  const queueOffline = async () => {
    await enqueueOfflineOp({
      id: mvtId,
      shopId: params.shopId,
      opType: 'adjust_stock',
      label: `Ajustement stock · ${params.product.name}`,
      amount: qty,
      actor,
      createdAtIso: new Date().toISOString(),
      retryCount: 0,
      payload: {
        type: 'adjust_stock',
        mvtId,
        product: params.product,
        adjustmentType: params.type,
        quantity: qty,
        reason: params.reason,
      },
    });
  };

  if (!params._skipOfflineQueue && typeof navigator !== 'undefined' && !navigator.onLine) {
    await queueOffline();
    return;
  }

  try {
    await runTransaction(db, async (tx) => {
      if (params._presetMvtId) {
        const existingMvt = await tx.get(doc(db, 'shops', params.shopId, 'stock_movements', mvtId));
        if (existingMvt.exists()) return;
      }

      const prodRef = doc(db, 'shops', params.shopId, 'products', params.product.id);
      const prodSnap = await tx.get(prodRef);
      if (!prodSnap.exists()) throw new Error('Produit introuvable.');

      const isPositive = params.type === 'adjustment_in' || params.type === 'return';
      const signedQty = isPositive ? qty : -qty;
      const prevStock = Number(prodSnap.data().stock) || 0;
      const newStock = prevStock + signedQty;

      tx.update(prodRef, { stock: newStock, updatedAt: serverTimestamp() });

      tx.set(doc(db, 'shops', params.shopId, 'stock_movements', mvtId), {
        shopId: params.shopId,
        productId: params.product.id,
        productName: clampStr(prodSnap.data().name, 140),
        type: params.type,
        quantity: signedQty,
        previousStock: prevStock,
        newStock,
        referenceId: mvtId,
        reason: clampStr(params.reason, 200),
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'shops', params.shopId, 'activity_logs', generateDocId('log')), {
        shopId: params.shopId,
        action: 'AJUSTEMENT_STOCK',
        module: 'inventory',
        description: clampStr(
          `${prodSnap.data().name} : ${signedQty > 0 ? `+${signedQty}` : signedQty} (${params.reason})`,
          240
        ),
        amount: 0,
        referenceId: mvtId,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (!params._skipOfflineQueue && isOfflineNetworkError(err)) {
      await queueOffline();
      return;
    }
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- TREASURY ACCOUNTS & INTERNAL TRANSFERS ---
export async function createTreasuryAccount(params: {
  shopId: string;
  name: string;
  type: TreasuryAccountType;
  accountNumber?: string;
  initialBalance: number;
}): Promise<void> {
  const actor = getCurrentActor();
  const accId = generateDocId('acc');
  const path = `shops/${params.shopId}/treasury_accounts/${accId}`;
  try {
    const batch = writeBatch(db);
    const bal = Number(params.initialBalance) || 0;
    batch.set(doc(db, 'shops', params.shopId, 'treasury_accounts', accId), {
      shopId: params.shopId,
      name: clampStr(params.name, 80),
      type: params.type,
      accountNumber: clampStr(params.accountNumber, 60),
      balance: bal,
      isDefault: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (bal > 0) {
      batch.set(doc(db, 'shops', params.shopId, 'treasury_transactions', generateDocId('tx')), {
        shopId: params.shopId,
        accountId: accId,
        accountName: clampStr(params.name, 80),
        direction: 'in',
        category: 'initial',
        amount: bal,
        balanceAfter: bal,
        referenceId: accId,
        description: clampStr(`Solde d'ouverture · ${params.name}`, 200),
        paymentMethod: params.type,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });
    }

    await commitOfflineAware(batch.commit());
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function transferTreasuryAtomic(params: {
  shopId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  description: string;
  _presetRefId?: string;
  _skipOfflineQueue?: boolean;
}): Promise<void> {
  const actor = getCurrentActor();
  const path = `shops/${params.shopId}/treasury_transactions`;
  if (params.fromAccountId === params.toAccountId) {
    throw new Error('Veuillez choisir deux comptes différents.');
  }
  const refId = params._presetRefId || generateDocId('trf');
  const amt = Math.max(1, Math.round(Number(params.amount)));

  const queueOffline = async () => {
    await enqueueOfflineOp({
      id: refId,
      shopId: params.shopId,
      opType: 'transfer_treasury',
      label: `Transfert trésorerie`,
      amount: amt,
      actor,
      createdAtIso: new Date().toISOString(),
      retryCount: 0,
      payload: {
        type: 'transfer_treasury',
        refId,
        fromAccountId: params.fromAccountId,
        toAccountId: params.toAccountId,
        amount: amt,
        description: params.description,
      },
    });
  };

  if (!params._skipOfflineQueue && typeof navigator !== 'undefined' && !navigator.onLine) {
    await queueOffline();
    return;
  }

  try {
    await runTransaction(db, async (tx) => {
      if (params._presetRefId) {
        const existingLog = await tx.get(doc(db, 'shops', params.shopId, 'activity_logs', `log_${refId}`));
        if (existingLog.exists()) return;
      }

      const fromRef = doc(db, 'shops', params.shopId, 'treasury_accounts', params.fromAccountId);
      const toRef = doc(db, 'shops', params.shopId, 'treasury_accounts', params.toAccountId);
      const [fromSnap, toSnap] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
      if (!fromSnap.exists() || !toSnap.exists()) throw new Error('Compte introuvable.');

      const fromData = fromSnap.data();
      const toData = toSnap.data();
      const fromAfter = (Number(fromData.balance) || 0) - amt;
      const toAfter = (Number(toData.balance) || 0) + amt;

      tx.update(fromRef, { balance: fromAfter, updatedAt: serverTimestamp() });
      tx.update(toRef, { balance: toAfter, updatedAt: serverTimestamp() });

      tx.set(doc(db, 'shops', params.shopId, 'treasury_transactions', generateDocId('tx')), {
        shopId: params.shopId,
        accountId: fromSnap.id,
        accountName: clampStr(fromData.name, 80),
        direction: 'out',
        category: 'transfer_out',
        amount: amt,
        balanceAfter: fromAfter,
        referenceId: refId,
        description: clampStr(`Transfert vers ${toData.name}${params.description ? ` · ${params.description}` : ''}`, 200),
        paymentMethod: fromData.type,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'shops', params.shopId, 'treasury_transactions', generateDocId('tx')), {
        shopId: params.shopId,
        accountId: toSnap.id,
        accountName: clampStr(toData.name, 80),
        direction: 'in',
        category: 'transfer_in',
        amount: amt,
        balanceAfter: toAfter,
        referenceId: refId,
        description: clampStr(`Transfert depuis ${fromData.name}${params.description ? ` · ${params.description}` : ''}`, 200),
        paymentMethod: toData.type,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'shops', params.shopId, 'activity_logs', `log_${refId}`), {
        shopId: params.shopId,
        action: 'TRANSFERT_TRESORERIE',
        module: 'treasury',
        description: clampStr(`Transfert ${fromData.name} → ${toData.name}`, 240),
        amount: amt,
        referenceId: refId,
        userId: actor.uid,
        userName: actor.name,
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (!params._skipOfflineQueue && isOfflineNetworkError(err)) {
      await queueOffline();
      return;
    }
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- TEAM & PERMISSIONS (Direct Staff Accounts without Google Login) ---
export async function createShopMember(params: {
  shopId: string;
  displayName: string;
  username: string;
  password: string;
  phone?: string;
  role: Exclude<RoleId, 'owner'>;
  permissions: PermissionKey[];
}): Promise<void> {
  const memberId = generateDocId('usr');
  const path = `shops/${params.shopId}/members/${memberId}`;
  try {
    const passwordHash = await hashSecret(params.password);
    await commitOfflineAware(
      setDoc(doc(db, 'shops', params.shopId, 'members', memberId), {
        shopId: params.shopId,
        uid: memberId,
        username: clampStr(params.username.toLowerCase(), 60),
        passwordHash,
        displayName: clampStr(params.displayName, 120),
        phone: clampStr(params.phone, 40),
        role: params.role,
        permissions: params.permissions.slice(0, 20),
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateShopMember(params: {
  shopId: string;
  memberId: string;
  displayName?: string;
  phone?: string;
  role?: Exclude<RoleId, 'owner'>;
  permissions?: PermissionKey[];
  active?: boolean;
  newPassword?: string;
  isOwner?: boolean;
}): Promise<void> {
  const path = `shops/${params.shopId}/members/${params.memberId}`;
  try {
    const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (params.displayName !== undefined) payload.displayName = clampStr(params.displayName, 120);
    if (params.phone !== undefined) payload.phone = clampStr(params.phone, 40);
    if (!params.isOwner) {
      if (params.role !== undefined) payload.role = params.role;
      if (params.permissions !== undefined) payload.permissions = params.permissions.slice(0, 20);
      if (params.active !== undefined) payload.active = params.active;
    }
    if (params.newPassword && params.newPassword.trim().length > 0) {
      payload.passwordHash = await hashSecret(params.newPassword);
    }
    await commitOfflineAware(updateDoc(doc(db, 'shops', params.shopId, 'members', params.memberId), payload));
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteShopMember(shopId: string, memberId: string): Promise<void> {
  const path = `shops/${shopId}/members/${memberId}`;
  try {
    await commitOfflineAware(deleteDoc(doc(db, 'shops', shopId, 'members', memberId)));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function resetShopDataToZero(params: {
  shopId: string;
  actorMember: ShopMember;
  password: string;
  mode: 'transactions_only' | 'full_wipe';
  resetStockToZero?: boolean;
  deleteNonOwnerMembers?: boolean;
}): Promise<void> {
  if (params.actorMember.role !== 'owner' && params.actorMember.role !== 'admin') {
    throw new Error('Seul le propriétaire ou un gérant peut réinitialiser les données.');
  }
  const passwordOk = await verifyMemberPassword(params.actorMember, params.password);
  if (!passwordOk) {
    throw new Error('Mot de passe ou code PIN incorrect.');
  }

  const ops: ((batch: WriteBatch) => void)[] = [];
  const collectDeletes = async (colName: string) => {
    const p = `shops/${params.shopId}/${colName}`;
    try {
      const snap = await getDocs(
        query(collection(db, 'shops', params.shopId, colName), where('shopId', '==', params.shopId))
      );
      snap.docs.forEach((d) => {
        ops.push((b) => b.delete(d.ref));
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, p);
    }
  };

  // Always delete transactional & log collections
  await Promise.all([
    collectDeletes('sales'),
    collectDeletes('credit_payments'),
    collectDeletes('purchases'),
    collectDeletes('expenses'),
    collectDeletes('stock_movements'),
    collectDeletes('treasury_transactions'),
    collectDeletes('activity_logs'),
  ]);

  // Reset all treasury account balances to 0 FCFA
  try {
    const accSnap = await getDocs(
      query(collection(db, 'shops', params.shopId, 'treasury_accounts'), where('shopId', '==', params.shopId))
    );
    accSnap.docs.forEach((d) => {
      ops.push((b) => b.update(d.ref, { balance: 0, updatedAt: serverTimestamp() }));
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `shops/${params.shopId}/treasury_accounts`);
  }

  if (params.mode === 'full_wipe') {
    await Promise.all([
      collectDeletes('products'),
      collectDeletes('categories'),
      collectDeletes('customers'),
      collectDeletes('suppliers'),
    ]);

    if (params.deleteNonOwnerMembers) {
      try {
        const memSnap = await getDocs(
          query(collection(db, 'shops', params.shopId, 'members'), where('shopId', '==', params.shopId))
        );
        memSnap.docs.forEach((d) => {
          const data = d.data() as ShopMember;
          if (data.role !== 'owner') {
            ops.push((b) => b.delete(d.ref));
          }
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, `shops/${params.shopId}/members`);
      }
    }
  } else {
    // Transactions-only reset: zero out customer credits/spent and supplier debts/purchased
    try {
      const [custSnap, suppSnap, prodSnap] = await Promise.all([
        getDocs(query(collection(db, 'shops', params.shopId, 'customers'), where('shopId', '==', params.shopId))),
        getDocs(query(collection(db, 'shops', params.shopId, 'suppliers'), where('shopId', '==', params.shopId))),
        params.resetStockToZero
          ? getDocs(query(collection(db, 'shops', params.shopId, 'products'), where('shopId', '==', params.shopId)))
          : Promise.resolve(null),
      ]);

      custSnap.docs.forEach((d) => {
        ops.push((b) => b.update(d.ref, { creditBalance: 0, totalSpent: 0, updatedAt: serverTimestamp() }));
      });
      suppSnap.docs.forEach((d) => {
        ops.push((b) => b.update(d.ref, { debtBalance: 0, totalPurchased: 0, updatedAt: serverTimestamp() }));
      });
      if (prodSnap) {
        prodSnap.docs.forEach((d) => {
          ops.push((b) => b.update(d.ref, { stock: 0, updatedAt: serverTimestamp() }));
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, `shops/${params.shopId}/customers`);
    }
  }

  // Commit in chunks of 400 to respect Firestore 500-write batch limit
  try {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const slice = ops.slice(i, i + CHUNK_SIZE);
      slice.forEach((fn) => fn(batch));
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `shops/${params.shopId}`);
  }
}

let syncInProgress = false;

async function replayOfflineOp(op: OfflinePendingOp): Promise<void> {
  const previousActor = activeActor;
  setCurrentActor(op.actor);
  try {
    const p = op.payload;
    switch (p.type) {
      case 'create_sale':
        await createSaleAtomic({
          shopId: op.shopId,
          customer: p.customer,
          customerNameFallback: p.customerNameFallback,
          items: p.items,
          discount: p.discount,
          tvaRate: p.tvaRate,
          paymentMethod: p.paymentMethod,
          accountId: p.accountId,
          amountPaid: p.amountPaid,
          notes: p.notes,
          _presetSaleId: p.saleId,
          _presetInvoiceNumber: p.invoiceNumber,
          _skipOfflineQueue: true,
        });
        break;
      case 'record_credit_payment':
        await recordCreditPaymentAtomic({
          shopId: op.shopId,
          customer: p.customer,
          sale: p.saleId
            ? ({ id: p.saleId, invoiceNumber: p.invoiceNumber || '', total: p.saleTotal || 0 } as Sale)
            : null,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          accountId: p.accountId,
          notes: p.notes,
          _presetPaymentId: p.paymentId,
          _skipOfflineQueue: true,
        });
        break;
      case 'record_customer_debt':
        await recordCustomerDebtAtomic({
          shopId: op.shopId,
          customer: p.customer,
          amount: p.amount,
          amountPaid: p.amountPaid,
          paymentMethod: p.paymentMethod,
          accountId: p.accountId,
          reason: p.reason,
          _presetSaleId: p.saleId,
          _presetInvoiceNumber: p.invoiceNumber,
          _skipOfflineQueue: true,
        });
        break;
      case 'create_purchase':
        await createPurchaseAtomic({
          shopId: op.shopId,
          supplier: p.supplier,
          supplierNameFallback: p.supplierNameFallback,
          items: p.items,
          paymentMethod: p.paymentMethod,
          accountId: p.accountId,
          amountPaid: p.amountPaid,
          notes: p.notes,
          _presetPurchaseId: p.purchaseId,
          _presetReference: p.reference,
          _skipOfflineQueue: true,
        });
        break;
      case 'pay_supplier_debt':
        await paySupplierDebtAtomic({
          shopId: op.shopId,
          supplier: p.supplier,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          accountId: p.accountId,
          _presetTxId: p.txId,
          _skipOfflineQueue: true,
        });
        break;
      case 'record_expense':
        await recordExpenseOrIncomeAtomic({
          shopId: op.shopId,
          type: p.expenseType,
          category: p.category,
          title: p.title,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          accountId: p.accountId,
          notes: p.notes,
          _presetExpenseId: p.expenseId,
          _skipOfflineQueue: true,
        });
        break;
      case 'adjust_stock':
        await adjustStockAtomic({
          shopId: op.shopId,
          product: p.product,
          type: p.adjustmentType,
          quantity: p.quantity,
          reason: p.reason,
          _presetMvtId: p.mvtId,
          _skipOfflineQueue: true,
        });
        break;
      case 'transfer_treasury':
        await transferTreasuryAtomic({
          shopId: op.shopId,
          fromAccountId: p.fromAccountId,
          toAccountId: p.toAccountId,
          amount: p.amount,
          description: p.description,
          _presetRefId: p.refId,
          _skipOfflineQueue: true,
        });
        break;
    }
  } finally {
    activeActor = previousActor;
  }
}

export async function syncPendingOfflineOperations(shopId: string): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  if (!shopId || syncInProgress) {
    const ops = shopId ? await getPendingOpsForShop(shopId) : [];
    return { synced: 0, failed: 0, remaining: ops.length };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const ops = await getPendingOpsForShop(shopId);
    return { synced: 0, failed: 0, remaining: ops.length };
  }

  syncInProgress = true;
  let synced = 0;
  let failed = 0;
  try {
    const ops = await getPendingOpsForShop(shopId);
    for (const op of ops) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) break;
      try {
        await replayOfflineOp(op);
        await removePendingOp(op.id);
        synced += 1;
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          break;
        }
        failed += 1;
        await updatePendingOpError(op.id, err instanceof Error ? err.message : String(err));
      }
    }
    const remainingOps = await getPendingOpsForShop(shopId);
    return { synced, failed, remaining: remainingOps.length };
  } finally {
    syncInProgress = false;
  }
}
