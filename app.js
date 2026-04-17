// ===== CONFIGURATION =====
const SHEET_ID = '16_Xc4pHKmNFIuNOExlOkZg1Pl6yV2REhPuthK6cM_kc';
const WHATSAPP_NUMBER = '213784323036';
const GITHUB_BASE = 'https://adel200626.github.io/sizeplus/';

// ===== ÉTAT =====
let products = [];
let filteredProducts = [];
let cart = [];
let selectedSizes = {};
let colMap = {};

// ===== CHARGEMENT GOOGLE SHEETS =====
function fetchProducts() {
    document.getElementById('productsGrid').innerHTML = `
        <div class="loading"><div class="spinner"></div><p>Chargement des articles...</p></div>`;

    // Méthode 1 : fetch() — fonctionne sur GitHub Pages (HTTPS)
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

    fetch(url)
        .then(r => r.text())
        .then(text => {
            // La réponse est : /*O_o*/ google.visualization.Query.setResponse({...});
            const start = text.indexOf('(');
            const end = text.lastIndexOf(')');
            if (start < 0 || end < 0) throw new Error('Format invalide');
            const data = JSON.parse(text.slice(start + 1, end));
            processData(data);
        })
        .catch(() => {
            // Méthode 2 (fallback) : JSONP — pour ouverture locale (file://)
            fetchViaJsonp();
        });
}

function fetchViaJsonp() {
    const callbackName = '_sheetCb_' + Date.now();
    const script = document.createElement('script');

    const timer = setTimeout(() => {
        delete window[callbackName];
        if (script.parentNode) script.remove();
        showError('Délai dépassé. Vérifiez votre connexion.');
    }, 15000);

    window[callbackName] = function(data) {
        clearTimeout(timer);
        delete window[callbackName];
        if (script.parentNode) script.remove();
        processData(data);
    };

    script.onerror = function() {
        clearTimeout(timer);
        delete window[callbackName];
        showError('Erreur réseau.');
    };

    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json;responseHandler:${callbackName}`;
    document.head.appendChild(script);
}

function showError(msg) {
    document.getElementById('productsGrid').innerHTML = `
        <div class="error-msg" style="text-align:center;padding:40px">
            <p style="color:#c62828;font-weight:600">${msg}</p>
            <button onclick="fetchProducts()" style="margin-top:12px;padding:10px 24px;background:#d81b60;color:white;border:none;border-radius:8px;cursor:pointer">
                Réessayer
            </button>
        </div>`;
}

// ===== TRAITEMENT DES DONNÉES =====
function processData(data) {
    colMap = {}; // reset à chaque chargement
    const cols = data.table.cols;

    // Mapper les colonnes par nom (insensible accents + espaces)
    cols.forEach((col, index) => {
        // Normaliser : minuscules + trim + suppression accents
        const raw = (col.label || '').toLowerCase().trim();
        const label = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        // label est maintenant sans accents, ex: "designation", "promotion", "photo 1"

        if (label.includes('code'))          colMap.code = index;
        if (label.includes('designation'))   colMap.designation = index;
        if (label === 'prix de vente')       colMap.prixFinal = index;
        if (label === 'prix vente' && colMap.prixFinal === undefined) colMap.prix = index;
        if (label.includes('couleur'))       colMap.couleur = index;
        if (label.includes('taille'))        colMap.taille = index;
        if (label.includes('quantit'))       colMap.quantite = index;
        if (label.includes('photo 1') || label === 'photo1' || label === 'image 1' || label === 'image') colMap.image = index;
        if (label === 'promotion')           colMap.promotion = index;
        if (label === 'ancien prix' || label === 'ancien_prix')   colMap.ancienPrix = index;
        if (label === 'nouveau prix' || label === 'nouveau_prix') colMap.nouveauPrix = index;
    });

    // Fallbacks si colonnes non trouvées
    if (colMap.designation === undefined) colMap.designation = 7;
    if (colMap.prixFinal === undefined && colMap.prix === undefined) colMap.prix = 5;

    // Parser les lignes
    products = data.table.rows
        .map((row, idx) => {
            if (!row || !row.c) return null;
            const rowNumber = idx + 2; // ligne 1 = en-têtes

            const getVal = (key) => {
                const i = colMap[key];
                if (i === undefined || i === null) return '';
                const cell = row.c[i];
                if (!cell || cell.v === null || cell.v === undefined) return '';
                return String(cell.v).trim();
            };

            const designation = getVal('designation');
            if (!designation) return null;

            // Prix normal
            const prixStr = (getVal('prixFinal') || getVal('prix') || '0')
                .replace(/[^\d.,]/g, '').replace(',', '.');
            const prix = parseFloat(prixStr) || 0;

            // Promotion
            const promoRaw = getVal('promotion').toLowerCase().trim();
            const enPromo = promoRaw === 'oui' || promoRaw === 'yes' || promoRaw === '1';

            // Filtrer les articles sans prix et sans promo
            if (prix === 0 && !enPromo) return null;

            // Tailles
            const tailleRaw = getVal('taille');
            const tailles = tailleRaw
                ? [...new Set(tailleRaw.split(/[,،;]/).map(t => t.trim()).filter(t => t && t.toLowerCase() !== 'null' && t !== '0'))]
                : [];

            // Prix promo
            let ancienPrix = 0, nouveauPrix = 0;
            if (enPromo) {
                ancienPrix = parseFloat((getVal('ancienPrix') || '0').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
                nouveauPrix = parseFloat((getVal('nouveauPrix') || '0').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
                if (ancienPrix === 0) ancienPrix = prix;
                if (nouveauPrix === 0) nouveauPrix = prix;
            }

            // Photo : extraire le nom de fichier → URL GitHub Pages
            let imageRaw = getVal('image') || '';
            let image = '';
            if (imageRaw.startsWith('http://') || imageRaw.startsWith('https://')) {
                image = imageRaw;
            } else if (imageRaw) {
                const parts = imageRaw.replace(/\\/g, '/').split('/');
                const filename = parts[parts.length - 1];
                if (filename && /\.(jpg|jpeg|png|webp|gif)$/i.test(filename)) {
                    image = GITHUB_BASE + filename;
                }
            }

            const quantite = parseFloat(getVal('quantite')) || 0;
            const reduction = enPromo && ancienPrix > 0 && nouveauPrix < ancienPrix
                ? Math.round(((ancienPrix - nouveauPrix) / ancienPrix) * 100)
                : 0;

            return {
                id: idx,
                rowNumber,
                code: getVal('code'),
                designation,
                couleur: getVal('couleur'),
                tailles,
                prix: enPromo ? nouveauPrix : prix,
                ancienPrix: enPromo ? ancienPrix : 0,
                enPromo,
                reduction,
                image,
                quantite,
                enStock: tailles.length > 0 || quantite > 0
            };
        })
        .filter(p => p !== null);

    // Afficher uniquement les articles EN PROMO avec photo
    filteredProducts = products.filter(p => p.enPromo && p.image);
    renderProducts(filteredProducts);
    populateFilters();
}

// ===== FILTRES =====
function populateFilters() {
    const promoProducts = products.filter(p => p.enPromo && p.image);

    const categories = [...new Set(promoProducts.map(p => p.designation).filter(Boolean))].sort();
    const catSelect = document.getElementById('categoryFilter');
    catSelect.innerHTML = '<option value="">Toutes catégories</option>';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat; opt.textContent = cat;
        catSelect.appendChild(opt);
    });

    const allSizes = [...new Set(promoProducts.flatMap(p => p.tailles))].sort((a, b) => {
        const na = parseFloat(a), nb = parseFloat(b);
        return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b);
    });
    const sizeSelect = document.getElementById('sizeFilter');
    sizeSelect.innerHTML = '<option value="">Toutes tailles</option>';
    allSizes.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        sizeSelect.appendChild(opt);
    });
}

function applyFilters() {
    const search = document.getElementById('searchInput').value.toLowerCase().trim();
    const category = document.getElementById('categoryFilter').value;
    const size = document.getElementById('sizeFilter').value;

    filteredProducts = products.filter(p => {
        if (!p.enPromo || !p.image) return false;
        const matchSearch = !search ||
            p.designation.toLowerCase().includes(search) ||
            (p.couleur && p.couleur.toLowerCase().includes(search));
        const matchCategory = !category || p.designation === category;
        const matchSize = !size || p.tailles.includes(size);
        return matchSearch && matchCategory && matchSize;
    });

    renderProducts(filteredProducts);
}

// ===== RENDU PRODUITS =====
function renderProducts(list) {
    const grid = document.getElementById('productsGrid');
    document.getElementById('resultsCount').textContent =
        `${list.length} article${list.length !== 1 ? 's' : ''}`;

    if (list.length === 0) {
        grid.innerHTML = `<div class="no-results" style="text-align:center;padding:60px 20px">
            <p style="font-size:18px;color:#888">Aucun article trouvé</p>
            <span style="color:#aaa;font-size:14px">Essayez d'autres filtres</span>
        </div>`;
        return;
    }

    grid.innerHTML = list.map(p => createCardHTML(p)).join('');

    grid.querySelectorAll('.product-card').forEach(card => {
        const pid = parseInt(card.dataset.id);

        card.querySelectorAll('.size-tag').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                card.querySelectorAll('.size-tag').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedSizes[pid] = btn.dataset.size;
            });
        });

        const addBtn = card.querySelector('.add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', e => {
                e.stopPropagation();
                const product = products.find(p => p.id === pid);
                addToCart(product, selectedSizes[pid]);
            });
        }

        card.addEventListener('click', () => openModal(pid));
    });
}

function imgError(el) {
    el.style.display = 'none';
    if (el.nextElementSibling) el.nextElementSibling.style.display = 'flex';
}

function createCardHTML(p) {
    const ref = p.image ? p.image.split('/').pop().replace(/\.[^.]+$/, '') : (p.rowNumber || '');

    const imgHtml = p.image ? `
        <img class="card-img" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.designation)}"
             onerror="imgError(this)" loading="lazy">
        <div class="card-img-placeholder" style="display:none">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span>Photo bientôt</span>
        </div>` :
        `<div class="card-img-placeholder">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span>Photo bientôt</span>
        </div>`;

    const priceHtml = p.ancienPrix > 0
        ? `<div class="card-price-old">${formatPrice(p.ancienPrix)}</div>
           <div class="card-price-new">${formatPrice(p.prix)}</div>`
        : `<div class="card-price-normal">${formatPrice(p.prix)}</div>`;

    const sizesHtml = p.tailles.length > 0
        ? `<div class="card-sizes">${p.tailles.map(s =>
            `<span class="size-tag" data-size="${escapeHtml(s)}">${escapeHtml(s)}</span>`).join('')}</div>`
        : `<span class="no-size">Taille unique</span>`;

    return `
        <div class="product-card promo-card" data-id="${p.id}">
            <div class="card-img-wrap">
                ${imgHtml}
                <span class="promo-badge">Solde</span>
                ${p.reduction > 0 ? `<span class="discount-badge">-${p.reduction}%</span>` : ''}
            </div>
            <div class="card-body">
                <div class="card-name">${escapeHtml(p.designation)}</div>
                ${ref ? `<div class="card-ref">Réf. ${escapeHtml(String(ref))}</div>` : ''}
                <div>${priceHtml}</div>
                ${sizesHtml}
                ${!p.enStock ? '<span class="stock-badge">Épuisé</span>' : ''}
            </div>
            <div class="card-footer">
                <button class="add-btn" ${!p.enStock ? 'disabled' : ''}>
                    ${p.enStock ? '+ Ajouter au panier' : 'Épuisé'}
                </button>
            </div>
        </div>`;
}

// ===== MODAL =====
function openModal(pid) {
    const p = products.find(pr => pr.id === pid);
    if (!p) return;

    const imgHtml = p.image
        ? `<img class="modal-img" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.designation)}"
               onerror="this.outerHTML='<div class=modal-img-placeholder><span>Samel</span></div>'">`
        : `<div class="modal-img-placeholder">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                </svg>
                <span>Photo bientôt disponible</span>
           </div>`;

    const priceHtml = p.enPromo && p.ancienPrix > 0
        ? `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
               <div class="card-price-old" style="font-size:16px">${formatPrice(p.ancienPrix)}</div>
               <div class="card-price-new" style="font-size:26px">${formatPrice(p.prix)}</div>
               ${p.reduction > 0 ? `<span class="discount-badge" style="position:static;width:44px;height:44px;font-size:13px">-${p.reduction}%</span>` : ''}
           </div>`
        : `<div class="modal-price">${formatPrice(p.prix)}</div>`;

    document.getElementById('modalContent').innerHTML = `
        ${p.enPromo ? '<div style="background:linear-gradient(135deg,#ff6f00,#f57c00);color:white;padding:8px;text-align:center;font-weight:700;font-size:13px">🔥 ARTICLE EN PROMOTION</div>' : ''}
        ${imgHtml}
        <div class="modal-body">
            <div class="modal-name">${escapeHtml(p.designation)}</div>
            ${priceHtml}
            ${p.tailles.length > 0 ? '<div class="modal-sizes-label">Choisir votre taille :</div>' : ''}
            <div class="modal-sizes">
                ${p.tailles.map(s =>
                    `<button class="modal-size-btn" data-size="${escapeHtml(s)}">${escapeHtml(s)}</button>`
                ).join('') || '<span style="color:#aaa;font-size:13px">Taille unique</span>'}
            </div>
            <button class="modal-add-btn" id="modalAddBtn" ${!p.enStock ? 'disabled' : ''}>
                ${p.enStock ? '+ Ajouter au panier' : 'Épuisé'}
            </button>
        </div>`;

    let modalSelectedSize = selectedSizes[pid] || null;
    document.querySelectorAll('.modal-size-btn').forEach(btn => {
        if (btn.dataset.size === modalSelectedSize) btn.classList.add('selected');
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal-size-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            modalSelectedSize = btn.dataset.size;
            selectedSizes[pid] = modalSelectedSize;
        });
    });

    document.getElementById('modalAddBtn').addEventListener('click', () => {
        addToCart(p, modalSelectedSize);
        closeModal();
    });

    document.getElementById('productModal').classList.add('open');
}

function closeModal() {
    document.getElementById('productModal').classList.remove('open');
}

// ===== PANIER =====
function addToCart(product, taille) {
    if (!product) return;
    if (product.tailles.length > 0 && !taille) {
        alert('Veuillez choisir une taille !');
        return;
    }
    const key = `${product.id}_${taille || 'unique'}`;
    const existing = cart.find(i => i.key === key);
    if (existing) {
        existing.qty++;
    } else {
        cart.push({ key, product, taille: taille || 'Taille unique', qty: 1 });
    }
    renderCart();
    openCart();
    flashCartBtn();
}

function removeFromCart(key) {
    cart = cart.filter(i => i.key !== key);
    renderCart();
}

function updateQty(key, delta) {
    const item = cart.find(i => i.key === key);
    if (item) { item.qty = Math.max(1, item.qty + delta); renderCart(); }
}

function renderCart() {
    const badge = document.getElementById('cartBadge');
    const totalItems = cart.reduce((s, i) => s + i.qty, 0);
    badge.textContent = totalItems;

    const cartItemsEl = document.getElementById('cartItems');
    const cartFooter = document.getElementById('cartFooter');

    if (cart.length === 0) {
        cartItemsEl.innerHTML = `
            <div class="cart-empty">
                <p>Votre panier est vide</p>
                <span>Ajoutez des articles pour commander</span>
            </div>`;
        cartFooter.style.display = 'none';
        return;
    }

    cartFooter.style.display = 'block';
    document.getElementById('cartTotal').textContent = formatPrice(
        cart.reduce((s, i) => s + (i.product.prix * i.qty), 0)
    );

    cartItemsEl.innerHTML = cart.map(item => {
        const imgHtml = item.product.image
            ? `<img class="cart-item-img" src="${escapeHtml(item.product.image)}" alt=""
                   onerror="this.style.display='none'">`
            : `<div class="cart-item-img-placeholder">${escapeHtml(item.product.designation.substring(0, 2))}</div>`;

        const priceTag = item.product.enPromo
            ? `<div class="cart-item-price" style="color:#e65100">${formatPrice(item.product.prix * item.qty)} <span style="font-size:10px;background:#ffe0b2;padding:1px 5px;border-radius:4px">SOLDE</span></div>`
            : `<div class="cart-item-price">${formatPrice(item.product.prix * item.qty)}</div>`;

        return `
            <div class="cart-item">
                ${imgHtml}
                <div class="cart-item-info">
                    <div class="cart-item-name">${escapeHtml(item.product.designation)}</div>
                    <div class="cart-item-size">Taille : ${escapeHtml(item.taille)}</div>
                    ${priceTag}
                    <div class="cart-item-actions">
                        <button class="qty-btn" onclick="updateQty('${item.key}', -1)">−</button>
                        <span class="qty-value">${item.qty}</span>
                        <button class="qty-btn" onclick="updateQty('${item.key}', 1)">+</button>
                        <button class="remove-btn" onclick="removeFromCart('${item.key}')">Supprimer</button>
                    </div>
                </div>
            </div>`;
    }).join('');
}

function openCart() {
    document.getElementById('cartSidebar').classList.add('open');
    document.getElementById('overlay').classList.add('active');
}
function closeCart() {
    document.getElementById('cartSidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('active');
}
function flashCartBtn() {
    const btn = document.getElementById('cartBtn');
    btn.style.transform = 'scale(1.1)';
    setTimeout(() => btn.style.transform = '', 200);
}

// ===== COMMANDE WHATSAPP =====
function sendWhatsAppOrder() {
    if (cart.length === 0) return;

    const lines = cart.map((item, i) =>
        `${i + 1}. ${item.product.designation} - Taille: ${item.taille} - Qté: ${item.qty} - ${formatPrice(item.product.prix * item.qty)}${item.product.enPromo ? ' 🔥 PROMO' : ''}`
    );
    const total = cart.reduce((s, i) => s + (i.product.prix * i.qty), 0);

    const message = [
        '✨ *Nouvelle commande - Samel*',
        '',
        ...lines,
        '',
        `💰 *Total : ${formatPrice(total)}*`,
        '',
        '📦 Paiement à la livraison (COD)',
        '',
        '📝 Merci de préciser votre nom et adresse complète.'
    ].join('\n');

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank');
}

// ===== UTILITAIRES =====
function formatPrice(price) {
    if (!price || price === 0) return '—';
    return new Intl.NumberFormat('fr-DZ').format(Math.round(price)) + ' DA';
}
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    fetchProducts();
    document.getElementById('cartBtn').addEventListener('click', openCart);
    document.getElementById('closeCart').addEventListener('click', closeCart);
    document.getElementById('overlay').addEventListener('click', closeCart);
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('orderBtn').addEventListener('click', sendWhatsAppOrder);
    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('categoryFilter').addEventListener('change', applyFilters);
    document.getElementById('sizeFilter').addEventListener('change', applyFilters);
});
