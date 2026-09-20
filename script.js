// =====================================================
//  MAIKA PRINT STORE - script.js
//  Firebase v10 (Firestore + Authentication) | ES Modules
// =====================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, where, writeBatch, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ---------- الإعدادات ----------
const firebaseConfig = {
  apiKey: "AIzaSyBqfJUW-DoFzLU0bpthPSVEZX-BJnPMQNc",
  authDomain: "maika-print-39bbb.firebaseapp.com",
  projectId: "maika-print-39bbb",
  storageBucket: "maika-print-39bbb.firebasestorage.app",
  messagingSenderId: "813811951907",
  appId: "1:813811951907:web:148c8835b29a4c450dc496",
  measurementId: "G-L702SYRN8C"
};

const STORE_WHATSAPP = "201025386551";                   // رقم واتساب المتجر
const PROMO_CODES = { MAIKA10: 0.10, WELCOME20: 0.20 }; // أكواد الخصم
const SUGGESTED_CATEGORIES = ["طباعة ديجيتال", "ملابس وهدايا", "بوسترات وكروت"];
const IMAGE_MAX_SIZE = 400;   // أقصى بُعد للصورة بعد الضغط (بكسل)
const IMAGE_QUALITY = 0.7;    // جودة JPEG

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ---------- أدوات مساعدة ----------
const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

const safeStorage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } }
};

let toastTimer;
function showToast(message, type = "ok") {
  let el = $("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

function firestoreErrorMessage(e) {
  const code = e && e.code;
  if (code === "permission-denied") return "مفيش صلاحية. سجّل دخول الأدمن أو راجع الـ Rules في Firebase";
  if (code === "unavailable") return "تعذر الاتصال بقاعدة البيانات. تأكد من الإنترنت";
  if (code === "not-found") return "قاعدة Firestore مش موجودة. أنشئها من Firebase أولاً";
  return (e && e.message) || "حدث خطأ غير متوقع";
}

function compressImage(file, maxSize = IMAGE_MAX_SIZE, quality = IMAGE_QUALITY) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("تعذر قراءة الملف"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("الملف ليس صورة صالحة"));
      img.onload = () => {
        const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * ratio));
        const height = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// =====================================================
//  1) تسجيل دخول الأدمن (معدلة لتتوافق مع index.html)
// =====================================================
function openAdminModal() {
  const modal = $("adminModal");
  if (!modal) return;
  modal.style.display = "flex";
  const passInput = $("adminPassInput");
  if (passInput) {
    passInput.value = "";
    passInput.focus();
  }
  const errEl = $("errorMsg");
  if (errEl) errEl.textContent = "";
}

function closeAdminModal() {
  const modal = $("adminModal");
  if (modal) modal.style.display = "none";
}

async function submitAdminPass() {
  const pass = $("adminPassInput") ? $("adminPassInput").value : "";
  const errEl = $("errorMsg");
  const btn = $("adminSubmitBtn");

  if (!pass) {
    if (errEl) errEl.textContent = "اكتب كلمة السر أولاً";
    return;
  }

  if (errEl) errEl.textContent = "جاري التحقق...";
  if (btn) btn.disabled = true;

  try {
    // إيميل افتراضي ثابت مربوط بكلمة السر في Firebase Authentication
    const adminEmail = "admin@maikaprint.com"; 
    await signInWithEmailAndPassword(auth, adminEmail, pass);
    safeStorage.set("adminAuth", "true");
    window.location.href = "admin.html";
  } catch (e) {
    console.error("Login error:", e);
    if (errEl) errEl.textContent = "كلمة السر غير صحيحة!";
    if (btn) btn.disabled = false;
  }
}

function checkAdminAuth() {
  onAuthStateChanged(auth, (user) => {
    if (!user) window.location.replace("index.html");
  });
}

async function logoutAdmin() {
  try {
    await signOut(auth);
  } finally {
    window.location.href = "index.html";
  }
}

// =====================================================
//  2) الأقسام
// =====================================================
async function fetchCategories() {
  const snap = await getDocs(collection(db, "categories"));
  const list = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data.name) list.push({ id: d.id, name: data.name, createdAt: data.createdAt || 0 });
  });
  list.sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name, "ar"));
  return list;
}

async function renderPortalTags() {
  const box = $("portalTags");
  if (!box) return;
  try {
    const cats = await fetchCategories();
    box.innerHTML = cats.map((c) => `<span>${escapeHtml(c.name)}</span>`).join("");
  } catch (e) {
    console.error("renderPortalTags:", e);
  }
}

const categoryMeta = new Map();

function paintCategoryList(list, cats) {
  categoryMeta.clear();
  if (!cats.length) {
    list.innerHTML = `
      <li class="empty-note">
        <span>لا توجد أقسام بعد.</span>
        <button type="button" class="ghost-btn" onclick="addSuggestedCategories()">إضافة الأقسام المقترحة</button>
      </li>`;
    return;
  }
  list.innerHTML = cats.map((c) => {
    categoryMeta.set(c.id, { name: c.name, count: undefined });
    return `
      <li>
        <span class="cat-name">${escapeHtml(c.name)} <small class="count" data-count="${c.id}"></small></span>
        <button type="button" class="delete-btn" onclick="deleteCategory('${c.id}')">حذف</button>
      </li>`;
  }).join("");
  cats.forEach(loadCategoryCount);
}

async function loadCategoryCount(cat) {
  try {
    const q = query(collection(db, "products"), where("category", "==", cat.name));
    const snap = await getCountFromServer(q);
    const n = snap.data().count;
    const meta = categoryMeta.get(cat.id);
    if (meta) meta.count = n;
    const el = document.querySelector(`[data-count="${cat.id}"]`);
    if (el) el.textContent = `(${n} منتج)`;
  } catch (e) {
    console.warn("count failed:", e);
  }
}

function paintCategorySelect(select, cats) {
  if (!cats.length) {
    select.innerHTML = '<option value="">أضف قسماً أولاً</option>';
    return;
  }
  select.innerHTML = '<option value="">اختر القسم...</option>' +
    cats.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
}

async function refreshAdminCategories() {
  const list = $("categoriesList");
  const select = $("prodCategorySelect");
  if (!list && !select) return;
  try {
    const cats = await fetchCategories();
    if (list) paintCategoryList(list, cats);
    if (select) {
      const previous = select.value;
      paintCategorySelect(select, cats);
      if (previous && cats.some((c) => c.name === previous)) select.value = previous;
    }
  } catch (e) {
    console.error("refreshAdminCategories:", e);
    if (list) list.innerHTML = '<li class="muted">فشل تحميل الأقسام</li>';
    showToast(firestoreErrorMessage(e), "error");
  }
}

async function addCategory() {
  const input = $("newCategoryName");
  if (!input) return;
  const name = input.value.trim().replace(/\s+/g, " ");
  if (!name) {
    showToast("اكتب اسم القسم أولاً", "error");
    return;
  }
  try {
    const existing = await fetchCategories();
    if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      showToast("القسم ده موجود بالفعل", "error");
      return;
    }
    await addDoc(collection(db, "categories"), { name, createdAt: Date.now() });
    input.value = "";
    showToast("تمت إضافة القسم");
    await refreshAdminCategories();
  } catch (e) {
    console.error(e);
    showToast(firestoreErrorMessage(e), "error");
  }
}

async function addSuggestedCategories() {
  try {
    const existing = (await fetchCategories()).map((c) => c.name);
    const batch = writeBatch(db);
    const base = Date.now();
    let added = 0;
    SUGGESTED_CATEGORIES.forEach((name, i) => {
      if (existing.includes(name)) return;
      batch.set(doc(collection(db, "categories")), { name, createdAt: base + i });
      added++;
    });
    if (added) await batch.commit();
    showToast("تمت إضافة الأقسام المقترحة");
    await refreshAdminCategories();
  } catch (e) {
    console.error(e);
    showToast(firestoreErrorMessage(e), "error");
  }
}

async function deleteCategory(id) {
  const meta = categoryMeta.get(id);
  if (!meta) return;
  const n = meta.count;
  const msg = n > 0
    ? `حذف القسم "${meta.name}" هيحذف معاه ${n} منتج نهائياً. متأكد؟`
    : `حذف القسم "${meta.name}"؟`;
  if (!confirm(msg)) return;

  try {
    const snap = await getDocs(query(collection(db, "products"), where("category", "==", meta.name)));
    const refs = [];
    snap.forEach((d) => refs.push(d.ref));
    for (let i = 0; i < refs.length; i += 400) {
      const batch = writeBatch(db);
      refs.slice(i, i + 400).forEach((r) => batch.delete(r));
      await batch.commit();
    }
    await deleteDoc(doc(db, "categories", id));
    showToast("تم حذف القسم");
    await Promise.all([refreshAdminCategories(), renderAdminProducts()]);
  } catch (e) {
    console.error(e);
    showToast(firestoreErrorMessage(e), "error");
  }
}

// =====================================================
//  3) المنتجات (لوحة الأدمن)
// =====================================================
let previewUrl = null;

function previewProductImage(input) {
  const box = $("imagePreview");
  if (!box) return;
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  const file = input.files && input.files[0];
  if (!file) { box.innerHTML = ""; return; }
  previewUrl = URL.createObjectURL(file);
  box.innerHTML = `<img src="${previewUrl}" alt="معاينة الصورة">`;
}

async function saveProduct(event) {
  event.preventDefault();
  const form = event.target;
  const category = $("prodCategorySelect").value;
  const name = $("prodName").value.trim();
  const desc = $("prodDesc").value.trim();
  const price = Number($("prodPrice").value);
  const file = $("prodImageFile").files[0];

  if (!category) return showToast("اختار القسم أولاً", "error");
  if (!name) return showToast("اكتب اسم المنتج", "error");
  if (!Number.isFinite(price) || price < 0) return showToast("السعر غير صحيح", "error");
  if (!file) return showToast("اختار صورة للمنتج", "error");
  if (!file.type.startsWith("image/")) return showToast("الملف لازم يكون صورة", "error");

  const btn = $("saveProductBtn");
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "جاري الحفظ...";

  try {
    const image = await compressImage(file);
    if (image.length > 900000) throw new Error("الصورة كبيرة حتى بعد الضغط. جرّب صورة أصغر");
    await addDoc(collection(db, "products"), {
      category, name, desc, price, image, createdAt: Date.now()
    });
    showToast("تم حفظ المنتج ونشره");
    form.reset();
    previewProductImage($("prodImageFile"));
    await Promise.all([renderAdminProducts(), refreshAdminCategories()]);
  } catch (e) {
    console.error(e);
    showToast(firestoreErrorMessage(e), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

async function renderAdminProducts() {
  const box = $("adminProductsList");
  if (!box) return;
  box.innerHTML = '<p class="muted">جاري التحميل...</p>';
  try {
    const snap = await getDocs(collection(db, "products"));
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    if (!items.length) {
      box.innerHTML = '<p class="muted">لا توجد منتجات مضافة حالياً.</p>';
      return;
    }
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    box.innerHTML = items.map((p) => `
      <article class="prod-row">
        <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">
        <div class="prod-info">
          <strong>${escapeHtml(p.name)} <small>(${escapeHtml(p.category)})</small></strong>
          <textarea id="desc-${p.id}" rows="2" aria-label="الوصف">${escapeHtml(p.desc)}</textarea>
          <input type="number" id="price-${p.id}" value="${Number(p.price)}" min="0" step="any" inputmode="decimal" aria-label="السعر">
        </div>
        <div class="prod-actions">
          <button type="button" class="action-btn" onclick="updateProduct('${p.id}')">تحديث</button>
          <button type="button" class="delete-btn" onclick="deleteProduct('${p.id}')">حذف</button>
        </div>
      </article>`).join("");
  } catch (e) {
    console.error(e);
    box.innerHTML = '<p class="muted">خطأ في جلب المنتجات</p>';
    showToast(firestoreErrorMessage(e), "error");
  }
}

async function updateProduct(id) {
  const desc = $(`desc-${id}`).value.trim();
  const price = Number($(`price-${id}`).value);
  if (!Number.isFinite(price) || price < 0) return showToast("السعر غير صحيح", "error");
  try {
    await updateDoc(doc(db, "products", id), { desc, price });
    showToast("تم تعديل المنتج");
  } catch (e) {
    console.error(e);
    showToast(firestoreErrorMessage(e), "error");
  }
}

async function deleteProduct(id) {
  if (!confirm("حذف المنتج نهائياً من المتجر؟")) return;
  try {
    await deleteDoc(doc(db, "products", id));
    showToast("تم حذف المنتج");
    await Promise.all([renderAdminProducts(), refreshAdminCategories()]);
  } catch (e) {
    console.error(e);
    showToast(firestoreErrorMessage(e), "error");
  }
}

// =====================================================
//  4) المتجر
// =====================================================
let currentActiveCategory = "";
let storeCategories = [];
const productsCache = {};
let allProductsLoaded = false;
let searchTimer;

function paintTabs(activeName) {
  const tabs = $("categoriesTabs");
  if (!tabs) return;
  tabs.innerHTML = storeCategories.map((cat) => `
    <button type="button" class="tab-btn ${cat === activeName ? "active" : ""}"
            data-cat="${escapeHtml(cat)}" onclick="selectCategory(this.dataset.cat)">
      ${escapeHtml(cat)}
    </button>`).join("");
}

function productCardHtml(p) {
  return `
    <article class="product-card">
      <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async">
      <h3>${escapeHtml(p.name)}</h3>
      <p>${escapeHtml(p.desc)}</p>
      <div class="price">${Number(p.price)} EGP</div>
      <div class="card-qty">
        <div class="qty">
          <button type="button" onclick="stepQty('${p.id}', -1)" aria-label="تقليل الكمية">&minus;</button>
          <input type="number" id="qty-${p.id}" value="1" min="1" max="999" inputmode="numeric" aria-label="الكمية">
          <button type="button" onclick="stepQty('${p.id}', 1)" aria-label="زيادة الكمية">+</button>
        </div>
      </div>
      <button type="button" class="action-btn full" onclick="addToCart('${p.id}')">إضافة للسلة</button>
    </article>`;
}

function showProducts(list, emptyMsg) {
  const area = $("productsDisplayArea");
  if (!area) return;
  if (!list.length) {
    area.innerHTML = `<div class="no-products-msg">${escapeHtml(emptyMsg)}</div>`;
    return;
  }
  area.innerHTML = list.map(productCardHtml).join("");
}

async function displayStoreTabs() {
  const tabs = $("categoriesTabs");
  if (!tabs) return;
  try {
    storeCategories = (await fetchCategories()).map((c) => c.name);
  } catch (e) {
    console.error(e);
    showProducts([], "تعذر تحميل الأقسام. تأكد من الإنترنت وحاول تاني.");
    return;
  }
  if (!storeCategories.length) {
    tabs.innerHTML = "";
    showProducts([], "المتجر قيد التجهيز. لا توجد أقسام حالياً.");
    return;
  }
  if (!storeCategories.includes(currentActiveCategory)) currentActiveCategory = storeCategories[0];
  paintTabs(currentActiveCategory);
  renderProductsForCategory(currentActiveCategory);
}

function selectCategory(categoryName) {
  currentActiveCategory = categoryName;
  const search = $("searchInput");
  if (search) search.value = "";
  paintTabs(categoryName);
  renderProductsForCategory(categoryName);
}

async function renderProductsForCategory(categoryName) {
  const area = $("productsDisplayArea");
  if (!area) return;
  area.innerHTML = '<div class="no-products-msg">جاري تحميل المنتجات...</div>';
  try {
    const snap = await getDocs(query(collection(db, "products"), where("category", "==", categoryName)));
    const list = [];
    snap.forEach((d) => {
      const p = { id: d.id, ...d.data() };
      productsCache[p.id] = p;
      list.push(p);
    });
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (categoryName !== currentActiveCategory) return;
    showProducts(list, `لا توجد منتجات في قسم (${categoryName}) حالياً.`);
  } catch (e) {
    console.error(e);
    area.innerHTML = '<div class="no-products-msg">خطأ في جلب المنتجات. تأكد من الإنترنت وحاول تاني.</div>';
  }
}

function filterProducts() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 250);
}

async function runSearch() {
  const input = $("searchInput");
  const area = $("productsDisplayArea");
  if (!input || !area) return;
  const term = input.value.trim().toLowerCase();

  if (!term) {
    paintTabs(currentActiveCategory);
    renderProductsForCategory(currentActiveCategory);
    return;
  }

  try {
    if (!allProductsLoaded) {
      area.innerHTML = '<div class="no-products-msg">جاري البحث...</div>';
      const snap = await getDocs(collection(db, "products"));
      snap.forEach((d) => { productsCache[d.id] = { id: d.id, ...d.data() }; });
      allProductsLoaded = true;
    }
    if (input.value.trim().toLowerCase() !== term) return;
    paintTabs(null);
    const results = Object.values(productsCache)
      .filter((p) => (p.name || "").toLowerCase().includes(term) || (p.desc || "").toLowerCase().includes(term))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    showProducts(results, `لا توجد نتائج لـ "${input.value.trim()}".`);
  } catch (e) {
    console.error(e);
    area.innerHTML = '<div class="no-products-msg">تعذر البحث. تأكد من الإنترنت وحاول تاني.</div>';
  }
}

function stepQty(id, delta) {
  const input = $(`qty-${id}`);
  if (!input) return;
  input.value = Math.min(999, Math.max(1, (parseInt(input.value, 10) || 1) + delta));
}

// =====================================================
//  5) السلة وواتساب
// =====================================================
let activeDiscount = 0;

function getCart() {
  try {
    const cart = JSON.parse(safeStorage.get("cart") || "[]");
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  safeStorage.set("cart", JSON.stringify(cart));
  updateCartUI();
}

function addToCart(productId) {
  const p = productsCache[productId];
  if (!p) return;
  const qtyInput = $(`qty-${productId}`);
  const quantity = Math.min(999, Math.max(1, parseInt(qtyInput ? qtyInput.value : 1, 10) || 1));

  const cart = getCart();
  const existing = cart.find((item) => item.id === productId);
  if (existing) {
    existing.quantity = Math.min(999, existing.quantity + quantity);
  } else {
    cart.push({ id: productId, name: p.name, price: Number(p.price), category: p.category, quantity });
  }
  saveCart(cart);
  if (qtyInput) qtyInput.value = 1;
  showToast(`تمت إضافة ${quantity} × ${p.name} للسلة`);
}

function changeCartQty(index, delta) {
  const cart = getCart();
  if (!cart[index]) return;
  cart[index].quantity = Math.min(999, Math.max(1, cart[index].quantity + delta));
  saveCart(cart);
}

function removeFromCart(index) {
  const cart = getCart();
  cart.splice(index, 1);
  saveCart(cart);
}

function applyPromoCode() {
  const input = $("promoCodeInput");
  if (!input) return;
  const code = input.value.trim().toUpperCase();

  if (!code) {
    activeDiscount = 0;
    updateCartUI();
    showToast("تم إلغاء الخصم");
    return;
  }
  if (PROMO_CODES[code]) {
    activeDiscount = PROMO_CODES[code];
    updateCartUI();
    showToast(`تم تطبيق خصم ${Math.round(activeDiscount * 100)}%`);
  } else {
    showToast("كود الخصم غير صحيح أو منتهي", "error");
  }
}

function updateCartUI() {
  const cart = getCart();
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountValue = subtotal * activeDiscount;
  const total = subtotal - discountValue;

  const countEl = $("cartCount");
  const totalEl = $("cartTotalPrice");
  const infoEl = $("discountInfo");
  const listEl = $("cartItemsList");

  if (countEl) countEl.textContent = count;
  if (totalEl) totalEl.textContent = total.toFixed(2);
  if (infoEl) {
    infoEl.textContent = activeDiscount > 0
      ? `خصم ${Math.round(activeDiscount * 100)}% (−${discountValue.toFixed(2)} EGP)`
      : "";
  }
  if (!listEl) return;

  if (!cart.length) {
    listEl.innerHTML = '<p class="muted">السلة فارغة حالياً.</p>';
    return;
  }
  listEl.innerHTML = cart.map((item, index) => `
    <div class="cart-item">
      <div class="cart-info">
        <strong>${escapeHtml(item.name)}</strong>
        <small>${item.price} EGP × ${item.quantity} = ${(item.price * item.quantity).toFixed(2)} EGP</small>
      </div>
      <div class="qty">
        <button type="button" onclick="changeCartQty(${index}, -1)" aria-label="تقليل الكمية">&minus;</button>
        <span>${item.quantity}</span>
        <button type="button" onclick="changeCartQty(${index}, 1)" aria-label="زيادة الكمية">+</button>
      </div>
      <button type="button" class="delete-btn" onclick="removeFromCart(${index})" aria-label="حذف من السلة">حذف</button>
    </div>`).join("");
}

function toggleCartModal() {
  const modal = $("cartModal");
  if (!modal) return;
  const open = modal.style.display !== "flex";
  modal.style.display = open ? "flex" : "none";
  document.body.style.overflow = open ? "hidden" : "";
}

function sendCartToWhatsApp() {
  const cart = getCart();
  if (!cart.length) {
    showToast("السلة فارغة", "error");
    return;
  }
  let subtotal = 0;
  let message = "مرحباً MAIKA PRINT، أود طلب الطلبية التالية:\n\n";
  cart.forEach((item, i) => {
    const line = item.price * item.quantity;
    subtotal += line;
    message += `${i + 1}. *${item.name}* (العدد: ${item.quantity}) - ${line} EGP\n`;
  });
  if (activeDiscount > 0) {
    message += `\n*خصم ${Math.round(activeDiscount * 100)}%*`;
  }
  const total = subtotal - subtotal * activeDiscount;
  message += `\n*الإجمالي النهائي: ${total.toFixed(2)} EGP*`;

  window.open(`https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(message)}`, "_blank");
}

// =====================================================
// ربط الدوال بالصفحة
// =====================================================
Object.assign(window, {
  openAdminModal, closeAdminModal, submitAdminPass, logoutAdmin,
  addCategory, addSuggestedCategories, deleteCategory,
  saveProduct, previewProductImage, updateProduct, deleteProduct,
  selectCategory, filterProducts, stepQty,
  addToCart, changeCartQty, removeFromCart, applyPromoCode,
  toggleCartModal, sendCartToWhatsApp
});

function boot() {
  const page = document.body.dataset.page;
  if (page === "gate") renderPortalTags();
  if (page === "store") { displayStoreTabs(); updateCartUI(); }
  if (page === "admin") { checkAdminAuth(); refreshAdminCategories(); renderAdminProducts(); }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}