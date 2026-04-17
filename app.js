// ===== CONFIGURATION =====
const SHEET_ID = '16_Xc4pHKmNFIuNOExlOkZg1Pl6yV2REhPuthK6cM_kc';
const WHATSAPP_NUMBER = '213784323036';

// Photos disponibles (numéros de lignes du Google Sheet)
// Ajoutez ici le numéro quand vous mettez une nouvelle photo dans le dossier const PHOTOS_DISPONIBLES = [92, 95, 100];

// ===== ÉTAT =====
let products = [];
let filteredProducts = [];
let cart = [];
let selectedSizes = {};
let colMap = {};
let currentTab = 'promo'; // mode promotions uniquement

// ===== CHARGEMENT GOOGLE SHEETS (JSONP - fonctionne sans serveur) =====
function fetchProducts() {
    document.getElementById('productsGrid').innerHTML = `
        <div class="loading"><div class="spinner"></div><p>Chargement des articles...</p></div>`;

    const callbackName = '_sheetCb_' + Date.now();

    const promise = new Promise((resolve, reject) => {
        window[callbackName] = function(data) {
            delete window[callbackName];
            script.remove();
            resolve(data);
        };
        const script = document.createElement('script');
        script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json;responseHandler:${callbackName}`;
        script.onerror = () => reject(new Error('Erreur réseau'));
        document.head.appendChild(script);
        setTimeout(() => reject(new Error('Timeout')), 15000);
    });

    promise.then(data => {
        const cols = data.table.cols;

        // Mapper les colonnes par nom
        cols.forEach((col, index) => {
            const label = (col.label || '').toLowerCase().trim();
            if (label.includes('code')) colMap.code = index;
            if (label.includes('désignation') || label.includes('designation')) colMap.designation = index;
            if (label === 'prix de vente') colMap.prixFinal = index;
            if (label === 'prix vente' && colMap.prixFinal === undefined) colMap.prix = index;
            if (label.includes('couleur')) colMap.couleur = index;
            if (label.includes('taille')) colMap.taille = index;
            if (label.includes('quantit')) colMap.quantite = index;
            if (label.includes('photo 1') || label === 'photo1' || label === 'image') colMap.image = index;
            // Nouvelles colonnes promo
            if (label === 'promotion') colMap.promotion = index;
            if (label === 'ancien prix' || label === 'ancien_prix') colMap.ancienPrix = index;
            if (label === 'nouveau prix' || label === 'nouveau_prix') colMap.nouveauPrix = index;
        });

        if (colMap.designation === undefined) colMap.designation = 2;
        if (colMap.prixFinal === undefined && colMap.prix === undefined) colMap.prix = 1;

        // Parser les lignes (rowIndex = numéro de ligne réel dans le sheet, commence à 2)
        products = data.table.rows
            .map((row, idx) => {
                if (!row || !row.c) return null;
                const rowNumber = idx + 2; // ligne 1 = en-têtes, donc données démarrent à 2

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
                let prixStr = (getVal('prixFinal') || getVal('prix') || '0')
                    .replace(/[^\d.,]/g, '').replace(',', '.');
                const prix = parseFloat(prixStr) || 0;

                // Vérifier si promo avant de filtrer sur le prix
                const promoCheck = (getVal('promotion') || '').toLowerCase();
                const isPromo = promoCheck === 'oui' || promoCheck === 'yes' || promoCheck === '1';
                if (prix === 0 && !isPromo) return null;

                // Tailles (dédupliquées)
                const tailleRaw = getVal('taille');
                const tailles = tailleRaw
                    ? [...new Set(tailleRaw.split(/[,،;]/).map(t => t.trim()).filter(t => t && t.toLowerCase() !== 'null' && t !== '0'))]
                    : [];

                // Promo
                const promoVal = getVal('promotion').toLowerCase();
                const enPromo = promoVal === 'oui' || promoVal === 'yes' || promoVal === '1';

                let ancienPrix = 0, nouveauPrix = 0;
                if (enPromo) {
                    ancienPrix = parseFloat((getVal('ancienPrix') || '0').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
                    nouveauPrix = parseFloat((getVal('nouveauPrix') || '0').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
                    // Si prix manquant, utiliser le prix de vente normal
                    if (ancienPrix === 0) ancienPrix = prix;
                    if (nouveauPrix === 0) nouveauPrix = prix;
                }

                // Photo : extraire le nom de fichier depuis le chemin Windows ou URL directe
                let imageRaw = getVal('image') || '';
                let image = '';
                if (imageRaw.startsWith('http://') || imageRaw.startsWith('https://')) {
                    image = imageRaw;
                } else if (imageRaw) {
                    // Extraire le nom du fichier depuis chemin Windows (ex: C:\...\92.jpg → photos/92.jpg)
                    const parts = imageRaw.replace(/\\/g, '/').split('/');
                    const filename = parts[parts.length - 1];
                    if (filename) image = `photos/${filename}`;
                }

                const quantite = parseFloat(getVal('quantite')) || 0;

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
                    reduction: enPromo && ancienPrix > 0
                        ? Math.round(((ancienPrix - nouveauPrix) / ancienPrix) * 100)
                        : 0,
                    image,
                    quantite,
                    enStock: tailles.length > 0 || quantite > 0
                };
            })
            .filter(p => p !== null);

        filteredProducts = products.filter(p => p.enPromo && p.image);
        renderProducts(filteredProducts);
        populateFilters();

    }).catch(err => {
        console.error('Erreur:', err);
        document.getElementById('productsGrid').innerHTML = `
            <div class="error-msg">
                <p>Impossible de charger les articles.</p>
                <p style="font-size:12px;color:#aaa">Vérifiez votre connexion internet.</p>
                <button onclick="fetchProducts()">Réessayer</button>
            </div>`;
    });
}

// ===== ONGLETS =====
function switchTab(tab) {
    currentTab = tab;

    document.getElementById('tabAll').classList.toggle('active', tab === 'all');
    document.getElementById('tabPromo').classList.toggle('active', tab === 'promo');

    // Afficher bannière promo
    const existingBanner = document.getElementById('promoBanner');
    if (existingBanner) existingBanner.remove();

    if (tab === 'promo') {
        const banner = document.createElement('div');
        banner.id = 'promoBanner';
        banner.className = 'promo-banner';
        banner.innerHTML = '🔥 BIG SOLDE — Articles en déstockage · Prix cassés · Paiement à la livraison';
        document.querySelector('.main').insertAdjacentElement('beforebegin', banner);
    }

    applyFilters();
}

// ===== FILTRES =====
function populateFilters() {
    const categories = [...new Set(products.map(p => p.designation).filter(Boolean))].sort();
    const catSelect = document.getElementById('categoryFilter');
    catSelect.innerHTML = '<option value="">Toutes catégories</option>';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat; opt.textContent = cat;
        catSelect.appendChild(opt);
    });

    const allSizes = [...new Set(products.flatMap(p => p.tailles))].sort((a, b) => {
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
        grid.innerHTML = `<div class="no-results"><p>Aucun article trouvé</p><span>Essayez d'autres filtres</span></div>`;
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
    el.nextElementSibling.style.display = 'flex';
}

function createCardHTML(p) {
    // Référence = numéro extrait du nom de photo (ex: photos/92.jpg → 92)
    const ref = p.image ? p.image.replace('photos/', '').replace('.jpg', '') : '';

    const imgHtml = p.image ? `
        <img class="card-img" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.designation)}"
             onerror="imgError(this)">
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
                ${ref ? `<div class="card-color" style="color:#aaa;font-size:11px">Réf. ${escapeHtml(ref)}</div>` : ''}
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
            ${p.couleur ? `<div class="modal-color">Couleur : ${escapeHtml(p.couleur)}</div>` : ''}
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
    document.getElementById('cartTotal').textContent = formatPrice(cart.reduce((s, i) => s + (i.product.prix * i.qty), 0));

    cartItemsEl.innerHTML = cart.map(item => {
        const imgHtml = item.product.image
            ? `<img class="cart-item-img" src="${escapeHtml(item.product.image)}" alt=""
                   onerror="this.outerHTML='<div class=cart-item-img-placeholder>${escapeHtml(item.product.designation.substring(0, 6))}</div>'">`
            : `<div class="cart-item-img-placeholder">${escapeHtml(item.product.designation.substring(0, 6))}</div>`;

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

// ===== FONCTION PUBLIQUE : configurer le dossier photos =====
// Sera appelée quand vous envoyez le lien du dossier
function setPhotosFolder(baseUrl) {
    PHOTOS_BASE_URL = baseUrl;
    fetchProducts(); // Recharger avec les photos
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
