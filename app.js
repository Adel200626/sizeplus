// ============================================================
//  SAMEL — Configuration
// ============================================================
const SHEET_ID      = '16_Xc4pHKmNFIuNOExlOkZg1Pl6yV2REhPuthK6cM_kc';
const WHATSAPP      = '213784323036';
const GITHUB_PHOTOS = 'https://adel200626.github.io/sizeplus/';

// ============================================================
//  État global
// ============================================================
let allProducts    = [];   // tous les articles chargés
let promoProducts  = [];   // articles en promo avec photo
let cart           = [];
let selectedSizes  = {};

// ============================================================
//  Chargement des données — Google Sheets CSV
//  (méthode la plus fiable pour un site HTTPS statique)
// ============================================================
function loadProducts() {
    showLoading();

    // URL d'export CSV public de Google Sheets
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

    fetch(csvUrl)
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
        })
        .then(csv => {
            parseAndDisplay(csv);
        })
        .catch(err => {
            console.error('CSV fetch failed:', err);
            // Fallback : JSONP via gviz
            loadViaJsonp();
        });
}

// -------- Fallback JSONP --------
function loadViaJsonp() {
    const cb = '_gsCb' + Date.now();
    const s  = document.createElement('script');

    const t = setTimeout(() => {
        delete window[cb];
        s.remove();
        showError('Impossible de charger les articles.<br>Vérifiez votre connexion.');
    }, 15000);

    window[cb] = function(data) {
        clearTimeout(t);
        delete window[cb];
        s.remove();
        // Convertir les données gviz en CSV simulé
        parseAndDisplayGviz(data);
    };

    s.onerror = () => {
        clearTimeout(t);
        delete window[cb];
        showError('Erreur réseau.');
    };

    s.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json;responseHandler:${cb}`;
    document.head.appendChild(s);
}

// ============================================================
//  Parsing CSV
// ============================================================
function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQ = false;

    for (let i = 0; i <= text.length; i++) {
        const c = i < text.length ? text[i] : '\n';

        if (inQ) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQ = false;
            } else field += c;
        } else {
            if (c === '"')  inQ = true;
            else if (c === ',') { row.push(field); field = ''; }
            else if (c === '\n') {
                row.push(field.replace(/\r$/, ''));
                if (row.some(f => f.trim())) rows.push(row);
                row = []; field = '';
            } else field += c;
        }
    }
    return rows;
}

// Normaliser un nom de colonne pour la comparaison
function norm(str) {
    return String(str || '').toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function parseAndDisplay(csvText) {
    const rows = parseCSV(csvText);
    if (rows.length < 2) { showError('Données vides.'); return; }

    const headers = rows[0].map(h => norm(h));

    // Détection des colonnes par leur nom
    const findCol  = (kw)  => headers.findIndex(h => h.includes(norm(kw)));
    const exactCol = (kw)  => headers.findIndex(h => h === norm(kw));

    const C = {
        desig    : findCol('designation'),
        promo    : exactCol('promotion'),
        ancien   : findCol('ancien prix'),
        nouveau  : findCol('nouveau prix'),
        prixVente: findCol('prix vente'),
        taille   : findCol('taille'),
        photo    : findCol('photo 1'),
        qte      : findCol('quantit'),
    };

    // Fallbacks si colonne non trouvée
    if (C.desig    < 0) C.desig    = 7;
    if (C.promo    < 0) C.promo    = 2;
    if (C.ancien   < 0) C.ancien   = 3;
    if (C.nouveau  < 0) C.nouveau  = 4;
    if (C.prixVente< 0) C.prixVente= 5;
    if (C.taille   < 0) C.taille   = 10;
    if (C.photo    < 0) C.photo    = 15;
    if (C.qte      < 0) C.qte      = 11;

    const get = (row, i) => (i >= 0 && row[i] !== undefined) ? row[i].trim() : '';
    const toNum = str => parseFloat(String(str).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

    allProducts = rows.slice(1).map((row, idx) => {
        const designation = get(row, C.desig);
        if (!designation) return null;

        const enPromo   = norm(get(row, C.promo)) === 'oui';
        const prixBase  = toNum(get(row, C.prixVente));
        if (prixBase === 0 && !enPromo) return null;

        let ancienPrix  = toNum(get(row, C.ancien));
        let nouveauPrix = toNum(get(row, C.nouveau));
        if (enPromo && ancienPrix  === 0) ancienPrix  = prixBase;
        if (enPromo && nouveauPrix === 0) nouveauPrix = prixBase;

        const tailles = get(row, C.taille)
            ? [...new Set(get(row, C.taille).split(/[,;،]/).map(t => t.trim()).filter(t => t && t !== 'null' && t !== '0'))]
            : [];

        const photoRaw = get(row, C.photo);
        let image = '';
        if (photoRaw.startsWith('http')) {
            image = photoRaw;
        } else if (photoRaw) {
            const filename = photoRaw.replace(/\\/g, '/').split('/').pop();
            if (/\.(jpg|jpeg|png|webp|gif)$/i.test(filename)) {
                image = GITHUB_PHOTOS + filename;
            }
        }

        const quantite  = toNum(get(row, C.qte));
        const reduction = enPromo && ancienPrix > nouveauPrix
            ? Math.round((ancienPrix - nouveauPrix) / ancienPrix * 100) : 0;

        return {
            id: idx,
            designation,
            tailles,
            prix      : enPromo ? nouveauPrix : prixBase,
            ancienPrix: enPromo ? ancienPrix  : 0,
            enPromo,
            reduction,
            image,
            quantite,
            enStock: tailles.length > 0 || quantite > 0
        };
    }).filter(Boolean);

    afficherPromos();
}

// -------- Fallback gviz --------
function parseAndDisplayGviz(data) {
    const cols    = data.table.cols;
    const headers = cols.map(c => norm(c.label || ''));

    const findCol  = (kw) => headers.findIndex(h => h.includes(norm(kw)));
    const exactCol = (kw) => headers.findIndex(h => h === norm(kw));

    const C = {
        desig    : findCol('designation'),
        promo    : exactCol('promotion'),
        ancien   : findCol('ancien prix'),
        nouveau  : findCol('nouveau prix'),
        prixVente: findCol('prix vente'),
        taille   : findCol('taille'),
        photo    : findCol('photo 1'),
        qte      : findCol('quantit'),
    };

    if (C.desig    < 0) C.desig    = 7;
    if (C.promo    < 0) C.promo    = 2;
    if (C.ancien   < 0) C.ancien   = 3;
    if (C.nouveau  < 0) C.nouveau  = 4;
    if (C.prixVente< 0) C.prixVente= 5;
    if (C.taille   < 0) C.taille   = 10;
    if (C.photo    < 0) C.photo    = 15;
    if (C.qte      < 0) C.qte      = 11;

    const toNum = str => parseFloat(String(str || '').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

    const getV = (row, i) => {
        if (i < 0 || !row.c || !row.c[i] || row.c[i].v == null) return '';
        return String(row.c[i].v).trim();
    };

    allProducts = data.table.rows.map((row, idx) => {
        const designation = getV(row, C.desig);
        if (!designation) return null;

        const enPromo   = norm(getV(row, C.promo)) === 'oui';
        const prixBase  = toNum(getV(row, C.prixVente));
        if (prixBase === 0 && !enPromo) return null;

        let ancienPrix  = toNum(getV(row, C.ancien));
        let nouveauPrix = toNum(getV(row, C.nouveau));
        if (enPromo && ancienPrix  === 0) ancienPrix  = prixBase;
        if (enPromo && nouveauPrix === 0) nouveauPrix = prixBase;

        const tailles = getV(row, C.taille)
            ? [...new Set(getV(row, C.taille).split(/[,;،]/).map(t => t.trim()).filter(t => t && t !== 'null' && t !== '0'))]
            : [];

        const photoRaw = getV(row, C.photo);
        let image = '';
        if (photoRaw.startsWith('http')) {
            image = photoRaw;
        } else if (photoRaw) {
            const filename = photoRaw.replace(/\\/g, '/').split('/').pop();
            if (/\.(jpg|jpeg|png|webp|gif)$/i.test(filename)) {
                image = GITHUB_PHOTOS + filename;
            }
        }

        const quantite  = toNum(getV(row, C.qte));
        const reduction = enPromo && ancienPrix > nouveauPrix
            ? Math.round((ancienPrix - nouveauPrix) / ancienPrix * 100) : 0;

        return {
            id: idx, designation, tailles,
            prix: enPromo ? nouveauPrix : prixBase,
            ancienPrix: enPromo ? ancienPrix : 0,
            enPromo, reduction, image, quantite,
            enStock: tailles.length > 0 || quantite > 0
        };
    }).filter(Boolean);

    afficherPromos();
}

// ============================================================
//  Affichage
// ============================================================
function afficherPromos() {
    promoProducts = allProducts.filter(p => p.enPromo && p.image);
    renderProducts(promoProducts);
    populateFilters();
}

function populateFilters() {
    const cats = [...new Set(promoProducts.map(p => p.designation))].sort();
    const catSel = document.getElementById('categoryFilter');
    catSel.innerHTML = '<option value="">Toutes catégories</option>';
    cats.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o); });

    const sizes = [...new Set(promoProducts.flatMap(p => p.tailles))].sort((a, b) => {
        const na = parseFloat(a), nb = parseFloat(b);
        return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
    });
    const sizeSel = document.getElementById('sizeFilter');
    sizeSel.innerHTML = '<option value="">Toutes tailles</option>';
    sizes.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; sizeSel.appendChild(o); });
}

function applyFilters() {
    const q    = document.getElementById('searchInput').value.toLowerCase().trim();
    const cat  = document.getElementById('categoryFilter').value;
    const size = document.getElementById('sizeFilter').value;

    const list = promoProducts.filter(p => {
        const okSearch = !q || p.designation.toLowerCase().includes(q);
        const okCat    = !cat  || p.designation === cat;
        const okSize   = !size || p.tailles.includes(size);
        return okSearch && okCat && okSize;
    });
    renderProducts(list);
}

function renderProducts(list) {
    const grid = document.getElementById('productsGrid');
    document.getElementById('resultsCount').textContent = `${list.length} article${list.length !== 1 ? 's' : ''}`;

    if (list.length === 0) {
        grid.innerHTML = `<div class="no-results"><p>Aucun article trouvé</p><span>Essayez d'autres filtres</span></div>`;
        return;
    }

    grid.innerHTML = list.map(p => cardHTML(p)).join('');

    grid.querySelectorAll('.product-card').forEach(card => {
        const id = +card.dataset.id;
        card.querySelectorAll('.size-tag').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                card.querySelectorAll('.size-tag').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedSizes[id] = btn.dataset.size;
            });
        });
        card.querySelector('.add-btn')?.addEventListener('click', e => {
            e.stopPropagation();
            addToCart(allProducts.find(p => p.id === id), selectedSizes[id]);
        });
        card.addEventListener('click', () => openModal(id));
    });
}

function imgErr(el) {
    el.style.display = 'none';
    if (el.nextElementSibling) el.nextElementSibling.style.display = 'flex';
}

function cardHTML(p) {
    const ref = p.image ? p.image.split('/').pop().replace(/\.[^.]+$/, '') : '';
    const img = p.image
        ? `<img class="card-img" src="${esc(p.image)}" alt="${esc(p.designation)}" loading="lazy" onerror="imgErr(this)">
           <div class="card-img-placeholder" style="display:none"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>Photo bientôt</span></div>`
        : `<div class="card-img-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>Photo bientôt</span></div>`;

    const price = p.ancienPrix > 0
        ? `<div class="card-price-old">${fmt(p.ancienPrix)}</div><div class="card-price-new">${fmt(p.prix)}</div>`
        : `<div class="card-price-normal">${fmt(p.prix)}</div>`;

    const sizes = p.tailles.length
        ? `<div class="card-sizes">${p.tailles.map(s => `<span class="size-tag" data-size="${esc(s)}">${esc(s)}</span>`).join('')}</div>`
        : `<span class="no-size">Taille unique</span>`;

    return `<div class="product-card promo-card" data-id="${p.id}">
        <div class="card-img-wrap">
            ${img}
            <span class="promo-badge">Solde</span>
            ${p.reduction > 0 ? `<span class="discount-badge">-${p.reduction}%</span>` : ''}
        </div>
        <div class="card-body">
            <div class="card-name">${esc(p.designation)}</div>
            ${ref ? `<div class="card-ref" style="color:#aaa;font-size:11px">Réf. ${esc(ref)}</div>` : ''}
            ${price}
            ${sizes}
        </div>
        <div class="card-footer">
            <button class="add-btn" ${!p.enStock ? 'disabled' : ''}>${p.enStock ? '+ Ajouter au panier' : 'Épuisé'}</button>
        </div>
    </div>`;
}

// ============================================================
//  Modal
// ============================================================
function openModal(id) {
    const p = allProducts.find(pr => pr.id === id);
    if (!p) return;

    const img = p.image
        ? `<img class="modal-img" src="${esc(p.image)}" alt="${esc(p.designation)}" onerror="this.outerHTML='<div class=modal-img-placeholder><span>Samel</span></div>'">`
        : `<div class="modal-img-placeholder"><span>Photo bientôt</span></div>`;

    const price = p.ancienPrix > 0
        ? `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
               <div class="card-price-old" style="font-size:16px">${fmt(p.ancienPrix)}</div>
               <div class="card-price-new" style="font-size:26px">${fmt(p.prix)}</div>
               ${p.reduction > 0 ? `<span class="discount-badge" style="position:static;width:44px;height:44px;font-size:13px">-${p.reduction}%</span>` : ''}
           </div>`
        : `<div class="modal-price">${fmt(p.prix)}</div>`;

    document.getElementById('modalContent').innerHTML = `
        <div style="background:linear-gradient(135deg,#ff6f00,#f57c00);color:white;padding:8px;text-align:center;font-weight:700;font-size:13px">🔥 ARTICLE EN PROMOTION</div>
        ${img}
        <div class="modal-body">
            <div class="modal-name">${esc(p.designation)}</div>
            ${price}
            ${p.tailles.length ? '<div class="modal-sizes-label">Choisir votre taille :</div>' : ''}
            <div class="modal-sizes">
                ${p.tailles.map(s => `<button class="modal-size-btn" data-size="${esc(s)}">${esc(s)}</button>`).join('') || '<span style="color:#aaa;font-size:13px">Taille unique</span>'}
            </div>
            <button class="modal-add-btn" id="modalAddBtn" ${!p.enStock ? 'disabled' : ''}>${p.enStock ? '+ Ajouter au panier' : 'Épuisé'}</button>
        </div>`;

    let selSize = selectedSizes[id] || null;
    document.querySelectorAll('.modal-size-btn').forEach(btn => {
        if (btn.dataset.size === selSize) btn.classList.add('selected');
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal-size-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selSize = btn.dataset.size;
            selectedSizes[id] = selSize;
        });
    });

    document.getElementById('modalAddBtn').addEventListener('click', () => {
        addToCart(p, selSize);
        closeModal();
    });

    document.getElementById('productModal').classList.add('open');
}

function closeModal() {
    document.getElementById('productModal').classList.remove('open');
}

// ============================================================
//  Panier
// ============================================================
function addToCart(product, taille) {
    if (!product) return;
    if (product.tailles.length > 0 && !taille) { alert('Veuillez choisir une taille !'); return; }

    const key = `${product.id}_${taille || 'u'}`;
    const ex  = cart.find(i => i.key === key);
    if (ex) ex.qty++;
    else cart.push({ key, product, taille: taille || 'Taille unique', qty: 1 });

    renderCart();
    openCart();
    const btn = document.getElementById('cartBtn');
    btn.style.transform = 'scale(1.1)';
    setTimeout(() => btn.style.transform = '', 200);
}

function removeFromCart(key) { cart = cart.filter(i => i.key !== key); renderCart(); }
function updateQty(key, d) {
    const item = cart.find(i => i.key === key);
    if (item) { item.qty = Math.max(1, item.qty + d); renderCart(); }
}

function renderCart() {
    const badge = document.getElementById('cartBadge');
    badge.textContent = cart.reduce((s, i) => s + i.qty, 0);

    const itemsEl  = document.getElementById('cartItems');
    const footerEl = document.getElementById('cartFooter');

    if (!cart.length) {
        itemsEl.innerHTML = `<div class="cart-empty"><p>Votre panier est vide</p><span>Ajoutez des articles pour commander</span></div>`;
        footerEl.style.display = 'none';
        return;
    }

    footerEl.style.display = 'block';
    document.getElementById('cartTotal').textContent = fmt(cart.reduce((s, i) => s + i.product.prix * i.qty, 0));

    itemsEl.innerHTML = cart.map(item => {
        const imgEl = item.product.image
            ? `<img class="cart-item-img" src="${esc(item.product.image)}" alt="" onerror="this.style.display='none'">`
            : `<div class="cart-item-img-placeholder">${esc(item.product.designation.slice(0, 2))}</div>`;
        return `<div class="cart-item">
            ${imgEl}
            <div class="cart-item-info">
                <div class="cart-item-name">${esc(item.product.designation)}</div>
                <div class="cart-item-size">Taille : ${esc(item.taille)}</div>
                <div class="cart-item-price" style="color:#e65100">${fmt(item.product.prix * item.qty)} <span style="font-size:10px;background:#ffe0b2;padding:1px 5px;border-radius:4px">SOLDE</span></div>
                <div class="cart-item-actions">
                    <button class="qty-btn" onclick="updateQty('${item.key}',-1)">−</button>
                    <span class="qty-value">${item.qty}</span>
                    <button class="qty-btn" onclick="updateQty('${item.key}',1)">+</button>
                    <button class="remove-btn" onclick="removeFromCart('${item.key}')">Supprimer</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function openCart()  { document.getElementById('cartSidebar').classList.add('open'); document.getElementById('overlay').classList.add('active'); }
function closeCart() { document.getElementById('cartSidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('active'); }

// ============================================================
//  Commande WhatsApp
// ============================================================
function sendOrder() {
    if (!cart.length) return;
    const lines = cart.map((i, n) =>
        `${n+1}. ${i.product.designation} | Taille: ${i.taille} | Qté: ${i.qty} | ${fmt(i.product.prix * i.qty)} 🔥`
    );
    const total = cart.reduce((s, i) => s + i.product.prix * i.qty, 0);
    const msg = [
        '✨ *Nouvelle commande Samel*', '',
        ...lines, '',
        `💰 *Total : ${fmt(total)}*`, '',
        '📦 Paiement à la livraison (COD)', '',
        '📝 Merci d\'indiquer votre nom et adresse.'
    ].join('\n');

    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ============================================================
//  Utilitaires
// ============================================================
function fmt(n) {
    if (!n) return '—';
    return new Intl.NumberFormat('fr-DZ').format(Math.round(n)) + ' DA';
}
function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function showLoading() {
    document.getElementById('productsGrid').innerHTML = `<div class="loading"><div class="spinner"></div><p>Chargement des articles...</p></div>`;
}
function showError(msg) {
    document.getElementById('productsGrid').innerHTML = `
        <div style="text-align:center;padding:40px">
            <p style="color:#c62828;font-weight:600">${msg}</p>
            <button onclick="loadProducts()" style="margin-top:12px;padding:10px 24px;background:#d81b60;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px">↻ Réessayer</button>
        </div>`;
}

// ============================================================
//  Démarrage
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    document.getElementById('cartBtn').addEventListener('click', openCart);
    document.getElementById('closeCart').addEventListener('click', closeCart);
    document.getElementById('overlay').addEventListener('click', closeCart);
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('orderBtn').addEventListener('click', sendOrder);
    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('categoryFilter').addEventListener('change', applyFilters);
    document.getElementById('sizeFilter').addEventListener('change', applyFilters);
});
