// ============================================================
//  SAMEL — Configuration
// ============================================================
const SHEET_ID = '16_Xc4pHKmNFIuNOExlOkZg1Pl6yV2REhPuthK6cM_kc';
const WHATSAPP = '213784323036';
const IMG_BASE = 'https://adel200626.github.io/sizeplus/';

// ============================================================
//  État
// ============================================================
var allProducts   = [];
var promoProducts = [];
var cart          = [];
var selSizes      = {};

// ============================================================
//  Chargement via JSONP (aucun problème CORS)
// ============================================================
function loadProducts() {
    document.getElementById('productsGrid').innerHTML =
        '<div class="loading"><div class="spinner"></div><p>Chargement des articles...</p></div>';

    var cb  = 'gsCb' + Math.floor(Math.random() * 999999);
    var scr = document.createElement('script');
    var timer;

    window[cb] = function(data) {
        clearTimeout(timer);
        delete window[cb];
        if (scr.parentNode) scr.remove();
        try {
            process(data);
        } catch(e) {
            document.getElementById('productsGrid').innerHTML =
                '<p style="color:red;text-align:center;padding:30px">Erreur: ' + e.message + '</p>';
        }
    };

    scr.onerror = function() {
        clearTimeout(timer);
        delete window[cb];
        document.getElementById('productsGrid').innerHTML =
            '<p style="color:red;text-align:center;padding:30px">Erreur réseau. <button onclick="loadProducts()">Réessayer</button></p>';
    };

    timer = setTimeout(function() {
        delete window[cb];
        if (scr.parentNode) scr.remove();
        document.getElementById('productsGrid').innerHTML =
            '<p style="color:red;text-align:center;padding:30px">Timeout. <button onclick="loadProducts()">Réessayer</button></p>';
    }, 20000);

    scr.src = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
              '/gviz/tq?tqx=out:json;responseHandler:' + cb;
    document.head.appendChild(scr);
}

// ============================================================
//  Traitement des données gviz
// ============================================================
function process(data) {
    // ---- Trouver les colonnes par leur nom ----
    var cols    = data.table.cols;
    var headers = cols.map(function(c) {
        return (c.label || '').toLowerCase().trim();
    });

    // Cherche un index de colonne contenant le mot-clé
    function findIdx(keyword) {
        for (var i = 0; i < headers.length; i++) {
            if (headers[i].indexOf(keyword) !== -1) return i;
        }
        return -1;
    }

    // Cherche un index de colonne égal exactement au mot-clé
    function exactIdx(keyword) {
        for (var i = 0; i < headers.length; i++) {
            if (headers[i] === keyword || headers[i] === keyword + ' ') return i;
        }
        return -1;
    }

    var C = {
        name    : findIdx('sign'),        // désignation / designation
        promo   : exactIdx('promotion'),   // promotion exactement
        ancien  : findIdx('ancien'),       // ancien prix
        nouveau : findIdx('nouveau'),      // nouveau prix
        prix    : findIdx('prix vente'),   // prix vente
        taille  : findIdx('taille'),       // taille
        photo   : findIdx('photo 1'),      // photo 1
        qte     : findIdx('quantit'),      // quantité
    };

    // Fallbacks si colonnes non détectées
    if (C.name   < 0) C.name   = 7;
    if (C.promo  < 0) C.promo  = 2;
    if (C.ancien < 0) C.ancien = 3;
    if (C.nouveau< 0) C.nouveau= 4;
    if (C.prix   < 0) C.prix   = 5;
    if (C.taille < 0) C.taille = 10;
    if (C.photo  < 0) C.photo  = 15;
    if (C.qte    < 0) C.qte    = 11;

    // Lire la valeur d'une cellule
    function get(row, i) {
        if (i < 0 || !row || !row.c || !row.c[i]) return '';
        var cell = row.c[i];
        if (cell === null || cell.v === null || cell.v === undefined) return '';
        return String(cell.v).trim();
    }

    function toNum(str) {
        return parseFloat(String(str || '').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
    }

    // ---- Parser chaque ligne ----
    allProducts = [];
    for (var idx = 0; idx < data.table.rows.length; idx++) {
        var row = data.table.rows[idx];

        var name = get(row, C.name);
        if (!name) continue;

        var promoVal = get(row, C.promo).toLowerCase();
        var isPromo  = (promoVal === 'oui');

        var prixBase = toNum(get(row, C.prix));
        if (prixBase === 0 && !isPromo) continue;

        var ancien  = toNum(get(row, C.ancien));
        var nouveau = toNum(get(row, C.nouveau));
        if (isPromo && ancien  === 0) ancien  = prixBase;
        if (isPromo && nouveau === 0) nouveau = prixBase;

        // Tailles
        var tailleRaw = get(row, C.taille);
        var tailles = [];
        if (tailleRaw) {
            var parts = tailleRaw.split(/[,;،]/);
            var seen = {};
            for (var ti = 0; ti < parts.length; ti++) {
                var t = parts[ti].trim();
                if (t && t !== 'null' && t !== '0' && !seen[t]) {
                    tailles.push(t);
                    seen[t] = true;
                }
            }
        }

        // Photo
        var photoRaw = get(row, C.photo);
        var img = '';
        if (photoRaw) {
            if (photoRaw.indexOf('http') === 0) {
                img = photoRaw;
            } else {
                var fn = photoRaw.replace(/\\/g, '/').split('/').pop();
                if (/\.(jpg|jpeg|png|webp|gif)$/i.test(fn)) {
                    img = IMG_BASE + fn;
                }
            }
        }

        var qte    = toNum(get(row, C.qte));
        var reduc  = (isPromo && ancien > nouveau)
            ? Math.round((ancien - nouveau) / ancien * 100) : 0;

        allProducts.push({
            id      : idx,
            name    : name,
            tailles : tailles,
            prix    : isPromo ? nouveau : prixBase,
            ancien  : isPromo ? ancien  : 0,
            isPromo : isPromo,
            reduc   : reduc,
            img     : img,
            stock   : tailles.length > 0 || qte > 0
        });
    }

    // ---- Filtrer : promotions avec photo ----
    promoProducts = allProducts.filter(function(p) { return p.isPromo && p.img; });

    renderProducts(promoProducts);
    buildFilters();
}

// ============================================================
//  Rendu
// ============================================================
function renderProducts(list) {
    var grid = document.getElementById('productsGrid');
    document.getElementById('resultsCount').textContent =
        list.length + ' article' + (list.length !== 1 ? 's' : '');

    if (!list.length) {
        grid.innerHTML = '<div class="no-results"><p>Aucun article trouvé</p><span>Essayez d\'autres filtres</span></div>';
        return;
    }

    var html = '';
    for (var i = 0; i < list.length; i++) {
        html += cardHTML(list[i]);
    }
    grid.innerHTML = html;

    var cards = grid.querySelectorAll('.product-card');
    for (var ci = 0; ci < cards.length; ci++) {
        (function(card) {
            var pid = parseInt(card.dataset.id, 10);
            var sizeTags = card.querySelectorAll('.size-tag');
            for (var si = 0; si < sizeTags.length; si++) {
                (function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        for (var xi = 0; xi < sizeTags.length; xi++) sizeTags[xi].classList.remove('selected');
                        btn.classList.add('selected');
                        selSizes[pid] = btn.dataset.size;
                    });
                })(sizeTags[si]);
            }
            var addBtn = card.querySelector('.add-btn');
            if (addBtn) {
                addBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    addToCart(getProduct(pid), selSizes[pid]);
                });
            }
            card.addEventListener('click', function() { openModal(pid); });
        })(cards[ci]);
    }
}

function getProduct(id) {
    for (var i = 0; i < allProducts.length; i++) {
        if (allProducts[i].id === id) return allProducts[i];
    }
    return null;
}

function imgErr(el) {
    el.style.display = 'none';
    var next = el.nextElementSibling;
    if (next) next.style.display = 'flex';
}

function cardHTML(p) {
    var ref = p.img ? p.img.split('/').pop().replace(/\.[^.]+$/, '') : '';
    var imgPart = p.img
        ? '<img class="card-img" src="' + esc(p.img) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="imgErr(this)">' +
          '<div class="card-img-placeholder" style="display:none"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>Photo bientôt</span></div>'
        : '<div class="card-img-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>Photo bientôt</span></div>';

    var pricePart = p.ancien > 0
        ? '<div class="card-price-old">' + fmt(p.ancien) + '</div><div class="card-price-new">' + fmt(p.prix) + '</div>'
        : '<div class="card-price-normal">' + fmt(p.prix) + '</div>';

    var sizesPart = p.tailles.length
        ? '<div class="card-sizes">' + p.tailles.map(function(s) { return '<span class="size-tag" data-size="' + esc(s) + '">' + esc(s) + '</span>'; }).join('') + '</div>'
        : '<span class="no-size">Taille unique</span>';

    return '<div class="product-card promo-card" data-id="' + p.id + '">' +
        '<div class="card-img-wrap">' + imgPart +
            '<span class="promo-badge">Solde</span>' +
            (p.reduc > 0 ? '<span class="discount-badge">-' + p.reduc + '%</span>' : '') +
        '</div>' +
        '<div class="card-body">' +
            '<div class="card-name">' + esc(p.name) + '</div>' +
            (ref ? '<div class="card-ref" style="color:#aaa;font-size:11px">Réf. ' + esc(ref) + '</div>' : '') +
            pricePart + sizesPart +
        '</div>' +
        '<div class="card-footer">' +
            '<button class="add-btn"' + (!p.stock ? ' disabled' : '') + '>' +
            (p.stock ? '+ Ajouter au panier' : 'Épuisé') + '</button>' +
        '</div></div>';
}

// ============================================================
//  Filtres
// ============================================================
function buildFilters() {
    var cats = [], catSeen = {};
    var sizes = [], sizeSeen = {};
    for (var i = 0; i < promoProducts.length; i++) {
        var p = promoProducts[i];
        if (!catSeen[p.name]) { cats.push(p.name); catSeen[p.name] = true; }
        for (var j = 0; j < p.tailles.length; j++) {
            if (!sizeSeen[p.tailles[j]]) { sizes.push(p.tailles[j]); sizeSeen[p.tailles[j]] = true; }
        }
    }
    cats.sort();
    sizes.sort(function(a, b) { var na = parseFloat(a), nb = parseFloat(b); return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b); });

    var catSel = document.getElementById('categoryFilter');
    catSel.innerHTML = '<option value="">Toutes catégories</option>';
    cats.forEach(function(c) { catSel.innerHTML += '<option value="' + esc(c) + '">' + esc(c) + '</option>'; });

    var sizeSel = document.getElementById('sizeFilter');
    sizeSel.innerHTML = '<option value="">Toutes tailles</option>';
    sizes.forEach(function(s) { sizeSel.innerHTML += '<option value="' + esc(s) + '">' + esc(s) + '</option>'; });
}

function applyFilters() {
    var q    = document.getElementById('searchInput').value.toLowerCase().trim();
    var cat  = document.getElementById('categoryFilter').value;
    var size = document.getElementById('sizeFilter').value;
    var list = promoProducts.filter(function(p) {
        return (!q || p.name.toLowerCase().indexOf(q) !== -1) &&
               (!cat  || p.name === cat) &&
               (!size || p.tailles.indexOf(size) !== -1);
    });
    renderProducts(list);
}

// ============================================================
//  Modal
// ============================================================
function openModal(id) {
    var p = getProduct(id);
    if (!p) return;

    var imgPart = p.img
        ? '<img class="modal-img" src="' + esc(p.img) + '" alt="' + esc(p.name) + '" onerror="this.outerHTML=\'<div class=modal-img-placeholder><span>Samel</span></div>\'">'
        : '<div class="modal-img-placeholder"><span>Photo bientôt</span></div>';

    var pricePart = p.ancien > 0
        ? '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">' +
          '<div class="card-price-old" style="font-size:16px">' + fmt(p.ancien) + '</div>' +
          '<div class="card-price-new" style="font-size:26px">' + fmt(p.prix) + '</div>' +
          (p.reduc > 0 ? '<span class="discount-badge" style="position:static;width:44px;height:44px;font-size:13px">-' + p.reduc + '%</span>' : '') +
          '</div>'
        : '<div class="modal-price">' + fmt(p.prix) + '</div>';

    var sizesHtml = p.tailles.map(function(s) {
        return '<button class="modal-size-btn" data-size="' + esc(s) + '">' + esc(s) + '</button>';
    }).join('') || '<span style="color:#aaa;font-size:13px">Taille unique</span>';

    document.getElementById('modalContent').innerHTML =
        '<div style="background:linear-gradient(135deg,#ff6f00,#f57c00);color:white;padding:8px;text-align:center;font-weight:700;font-size:13px">🔥 ARTICLE EN PROMOTION</div>' +
        imgPart +
        '<div class="modal-body">' +
            '<div class="modal-name">' + esc(p.name) + '</div>' +
            pricePart +
            (p.tailles.length ? '<div class="modal-sizes-label">Choisir votre taille :</div>' : '') +
            '<div class="modal-sizes">' + sizesHtml + '</div>' +
            '<button class="modal-add-btn" id="modalAddBtn"' + (!p.stock ? ' disabled' : '') + '>' +
            (p.stock ? '+ Ajouter au panier' : 'Épuisé') + '</button>' +
        '</div>';

    var selSize = selSizes[id] || null;
    var modalBtns = document.querySelectorAll('.modal-size-btn');
    for (var i = 0; i < modalBtns.length; i++) {
        (function(btn) {
            if (btn.dataset.size === selSize) btn.classList.add('selected');
            btn.addEventListener('click', function() {
                for (var xi = 0; xi < modalBtns.length; xi++) modalBtns[xi].classList.remove('selected');
                btn.classList.add('selected');
                selSize = btn.dataset.size;
                selSizes[id] = selSize;
            });
        })(modalBtns[i]);
    }

    document.getElementById('modalAddBtn').addEventListener('click', function() {
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
    var key = product.id + '_' + (taille || 'u');
    var found = false;
    for (var i = 0; i < cart.length; i++) {
        if (cart[i].key === key) { cart[i].qty++; found = true; break; }
    }
    if (!found) cart.push({ key: key, product: product, taille: taille || 'Taille unique', qty: 1 });
    renderCart();
    openCart();
    var btn = document.getElementById('cartBtn');
    btn.style.transform = 'scale(1.1)';
    setTimeout(function() { btn.style.transform = ''; }, 200);
}

function removeFromCart(key) {
    cart = cart.filter(function(i) { return i.key !== key; });
    renderCart();
}

function updateQty(key, d) {
    for (var i = 0; i < cart.length; i++) {
        if (cart[i].key === key) { cart[i].qty = Math.max(1, cart[i].qty + d); break; }
    }
    renderCart();
}

function renderCart() {
    var total = 0;
    for (var i = 0; i < cart.length; i++) total += cart[i].qty;
    document.getElementById('cartBadge').textContent = total;

    var itemsEl  = document.getElementById('cartItems');
    var footerEl = document.getElementById('cartFooter');

    if (!cart.length) {
        itemsEl.innerHTML = '<div class="cart-empty"><p>Votre panier est vide</p><span>Ajoutez des articles pour commander</span></div>';
        footerEl.style.display = 'none';
        return;
    }

    footerEl.style.display = 'block';
    var grandTotal = 0;
    for (var i = 0; i < cart.length; i++) grandTotal += cart[i].product.prix * cart[i].qty;
    document.getElementById('cartTotal').textContent = fmt(grandTotal);

    var html = '';
    for (var i = 0; i < cart.length; i++) {
        var item = cart[i];
        var imgEl = item.product.img
            ? '<img class="cart-item-img" src="' + esc(item.product.img) + '" alt="" onerror="this.style.display=\'none\'">'
            : '<div class="cart-item-img-placeholder">' + esc(item.product.name.slice(0, 2)) + '</div>';

        html += '<div class="cart-item">' + imgEl +
            '<div class="cart-item-info">' +
                '<div class="cart-item-name">' + esc(item.product.name) + '</div>' +
                '<div class="cart-item-size">Taille : ' + esc(item.taille) + '</div>' +
                '<div class="cart-item-price" style="color:#e65100">' + fmt(item.product.prix * item.qty) +
                    ' <span style="font-size:10px;background:#ffe0b2;padding:1px 5px;border-radius:4px">SOLDE</span></div>' +
                '<div class="cart-item-actions">' +
                    '<button class="qty-btn" onclick="updateQty(\'' + item.key + '\',-1)">−</button>' +
                    '<span class="qty-value">' + item.qty + '</span>' +
                    '<button class="qty-btn" onclick="updateQty(\'' + item.key + '\',1)">+</button>' +
                    '<button class="remove-btn" onclick="removeFromCart(\'' + item.key + '\')">Supprimer</button>' +
                '</div>' +
            '</div></div>';
    }
    itemsEl.innerHTML = html;
}

function openCart()  { document.getElementById('cartSidebar').classList.add('open');    document.getElementById('overlay').classList.add('active');    }
function closeCart() { document.getElementById('cartSidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('active'); }

// ============================================================
//  Commande WhatsApp
// ============================================================
function sendOrder() {
    if (!cart.length) return;
    var lines = [];
    var total = 0;
    for (var i = 0; i < cart.length; i++) {
        var item = cart[i];
        var sub = item.product.prix * item.qty;
        total += sub;
        lines.push((i+1) + '. ' + item.product.name + ' | Taille: ' + item.taille + ' | Qté: ' + item.qty + ' | ' + fmt(sub) + ' 🔥');
    }
    var msg = '✨ *Nouvelle commande Samel*\n\n' + lines.join('\n') + '\n\n💰 *Total : ' + fmt(total) + '*\n\n📦 Paiement à la livraison (COD)\n\n📝 Merci d\'indiquer votre nom et adresse.';
    window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(msg), '_blank');
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

// ============================================================
//  Démarrage
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
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
