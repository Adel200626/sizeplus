// ============================================================
//  SAMEL — Configuration
// ============================================================
var SHEET_ID = '16_Xc4pHKmNFIuNOExlOkZg1Pl6yV2REhPuthK6cM_kc';
var WHATSAPP = '213784323036';
var IMG_BASE = 'https://adel200626.github.io/sizeplus/';

// ============================================================
//  Articles en promotion — mis à jour automatiquement
//  depuis Google Sheets. Si la connexion échoue, ces articles
//  s'affichent quand même (données de secours).
// ============================================================
var ARTICLES_SECOURS = [
    {
        id:0, name:'Haut Noir',
        tailles:['44','46','48','50'],
        prix:3400, ancien:4600, reduc:26,
        img: IMG_BASE + '92.jpg', stock:true
    },
    {
        id:1, name:'Haut Kaki',
        tailles:['44'],
        prix:3400, ancien:4600, reduc:26,
        img: IMG_BASE + '95.jpg', stock:true
    },
    {
        id:2, name:'Cardigan',
        tailles:['44','46'],
        prix:3800, ancien:5600, reduc:32,
        img: IMG_BASE + '100.jpg', stock:true
    },
    {
        id:3, name:'Robe Noir',
        tailles:['46','48'],
        prix:3600, ancien:4800, reduc:25,
        img: IMG_BASE + '147.jpg', stock:true
    }
];

// ============================================================
//  État
// ============================================================
var promoProducts = [];
var cart          = [];
var selSizes      = {};

// ============================================================
//  Démarrage — affiche les articles de secours puis essaie
//  de charger depuis Google Sheets
// ============================================================
function loadProducts() {
    // 1. Afficher immédiatement les articles de secours
    promoProducts = ARTICLES_SECOURS;
    renderProducts(promoProducts);
    buildFilters();

    // 2. Essayer de charger depuis Google Sheets en arrière-plan
    loadFromSheet();
}

// ============================================================
//  Chargement Google Sheets via fetch CSV
// ============================================================
function loadFromSheet() {
    var url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
              '/export?format=csv&cachebust=' + Date.now();

    fetch(url, { cache: 'no-store' })
        .then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
        })
        .then(function(csv) {
            var articles = parseCsv(csv);
            if (articles.length > 0) {
                promoProducts = articles;
                renderProducts(promoProducts);
                buildFilters();
            }
        })
        .catch(function(err) {
            // fetch CSV échoué → essayer JSONP
            loadViaJsonp();
        });
}

// Fallback JSONP si fetch bloqué
function loadViaJsonp() {
    var cb  = 'gsCb' + Math.floor(Math.random() * 999999);
    var scr = document.createElement('script');

    var timer = setTimeout(function() {
        delete window[cb];
        if (scr && scr.parentNode) scr.remove();
    }, 15000);

    window[cb] = function(data) {
        clearTimeout(timer);
        delete window[cb];
        if (scr && scr.parentNode) scr.remove();
        try {
            var articles = parseGviz(data);
            if (articles.length > 0) {
                promoProducts = articles;
                renderProducts(promoProducts);
                buildFilters();
            }
        } catch(e) {}
    };

    scr.onerror = function() { clearTimeout(timer); delete window[cb]; };

    scr.src = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
              '/gviz/tq?tqx=out:json;responseHandler:' + cb;
    document.head.appendChild(scr);
}

// ============================================================
//  Parsing CSV
// ============================================================
function parseCsv(text) {
    // Découper en lignes en gérant les guillemets
    var rows = [];
    var row = [], field = '', inQ = false;
    for (var i = 0; i <= text.length; i++) {
        var c = i < text.length ? text[i] : '\n';
        if (inQ) {
            if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else inQ = false; }
            else field += c;
        } else {
            if (c === '"') inQ = true;
            else if (c === ',') { row.push(field); field = ''; }
            else if (c === '\n') {
                row.push(field.replace(/\r$/, ''));
                if (row.some(function(f){ return f.trim(); })) rows.push(row);
                row = []; field = '';
            } else field += c;
        }
    }
    if (!rows.length) return [];

    // En-têtes
    var headers = rows[0].map(function(h) { return h.toLowerCase().trim(); });

    function findH(kw) {
        for (var i = 0; i < headers.length; i++) {
            if (headers[i].indexOf(kw) !== -1) return i;
        }
        return -1;
    }
    function exactH(kw) {
        for (var i = 0; i < headers.length; i++) {
            if (headers[i] === kw) return i;
        }
        return -1;
    }

    var iName   = findH('sign');
    var iPromo  = exactH('promotion');
    var iAncien = findH('ancien');
    var iNouv   = findH('nouveau');
    var iPrix   = findH('prix vente');
    var iTaille = findH('taille');
    var iPhoto  = findH('photo 1');
    var iQte    = findH('quantit');

    if (iName   < 0) iName   = 7;
    if (iPromo  < 0) iPromo  = 2;
    if (iAncien < 0) iAncien = 3;
    if (iNouv   < 0) iNouv   = 4;
    if (iPrix   < 0) iPrix   = 5;
    if (iTaille < 0) iTaille = 10;
    if (iPhoto  < 0) iPhoto  = 15;
    if (iQte    < 0) iQte    = 11;

    function g(row, i) {
        return (i >= 0 && row[i] !== undefined) ? row[i].trim() : '';
    }
    function toN(s) {
        return parseFloat(String(s||'').replace(/[^\d.,]/g,'').replace(',','.')) || 0;
    }

    var result = [];
    for (var ri = 1; ri < rows.length; ri++) {
        var r    = rows[ri];
        var name = g(r, iName);
        if (!name) continue;
        if (g(r, iPromo).toLowerCase() !== 'oui') continue;

        var prixBase = toN(g(r, iPrix));
        var ancien   = toN(g(r, iAncien));
        var nouveau  = toN(g(r, iNouv));
        if (ancien  === 0) ancien  = prixBase;
        if (nouveau === 0) nouveau = prixBase;

        var tailleRaw = g(r, iTaille);
        var tailles = [], seenT = {};
        if (tailleRaw) {
            var tp = tailleRaw.split(/[,;،]/);
            for (var ti = 0; ti < tp.length; ti++) {
                var t = tp[ti].trim();
                if (t && t !== 'null' && t !== '0' && !seenT[t]) { tailles.push(t); seenT[t] = true; }
            }
        }

        var photoRaw = g(r, iPhoto);
        var img = '';
        if (photoRaw) {
            if (photoRaw.indexOf('http') === 0) {
                img = photoRaw;
            } else {
                var fn = photoRaw.replace(/\\/g, '/').split('/').pop();
                if (/\.(jpg|jpeg|png|webp|gif)$/i.test(fn)) img = IMG_BASE + fn;
            }
        }
        if (!img) continue;

        var qte   = toN(g(r, iQte));
        var reduc = ancien > nouveau ? Math.round((ancien - nouveau) / ancien * 100) : 0;

        result.push({
            id: ri, name: name, tailles: tailles,
            prix: nouveau || prixBase, ancien: ancien, reduc: reduc,
            img: img, stock: tailles.length > 0 || qte > 0
        });
    }
    return result;
}

// ============================================================
//  Parsing JSONP gviz (fallback)
// ============================================================
function parseGviz(data) {
    var cols    = data.table.cols;
    var headers = [];
    for (var h = 0; h < cols.length; h++) {
        headers.push((cols[h].label || '').toLowerCase().trim());
    }

    // Trouver les colonnes
    function findCol(keyword) {
        for (var i = 0; i < headers.length; i++) {
            if (headers[i].indexOf(keyword) !== -1) return i;
        }
        return -1;
    }
    function exactCol(keyword) {
        for (var i = 0; i < headers.length; i++) {
            if (headers[i] === keyword) return i;
        }
        return -1;
    }

    var iName   = findCol('sign');      // désignation
    var iPromo  = exactCol('promotion');
    var iAncien = findCol('ancien');
    var iNouv   = findCol('nouveau');
    var iPrix   = findCol('prix vente');
    var iTaille = findCol('taille');
    var iPhoto  = findCol('photo 1');
    var iQte    = findCol('quantit');

    // Fallbacks par position
    if (iName   < 0) iName   = 7;
    if (iPromo  < 0) iPromo  = 2;
    if (iAncien < 0) iAncien = 3;
    if (iNouv   < 0) iNouv   = 4;
    if (iPrix   < 0) iPrix   = 5;
    if (iTaille < 0) iTaille = 10;
    if (iPhoto  < 0) iPhoto  = 15;
    if (iQte    < 0) iQte    = 11;

    function getCell(row, i) {
        if (i < 0 || !row || !row.c || i >= row.c.length) return '';
        var cell = row.c[i];
        if (!cell || cell.v === null || cell.v === undefined) return '';
        return String(cell.v).trim();
    }

    function toNum(str) {
        return parseFloat(String(str || '').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
    }

    var result = [];
    var rows   = data.table.rows;

    for (var idx = 0; idx < rows.length; idx++) {
        var row  = rows[idx];
        var name = getCell(row, iName);
        if (!name) continue;

        var promoVal = getCell(row, iPromo).toLowerCase();
        if (promoVal !== 'oui') continue;  // ignorer si pas en promo

        var prixBase = toNum(getCell(row, iPrix));
        var ancien   = toNum(getCell(row, iAncien));
        var nouveau  = toNum(getCell(row, iNouv));

        if (ancien  === 0) ancien  = prixBase;
        if (nouveau === 0) nouveau = prixBase;

        // Tailles (dédupliquées)
        var tailleRaw = getCell(row, iTaille);
        var tailles   = [];
        var seen      = {};
        if (tailleRaw) {
            var parts = tailleRaw.split(/[,;،]/);
            for (var ti = 0; ti < parts.length; ti++) {
                var t = parts[ti].trim();
                if (t && t !== 'null' && t !== '0' && !seen[t]) {
                    tailles.push(t);
                    seen[t] = true;
                }
            }
        }

        // Photo → URL absolue
        var photoRaw = getCell(row, iPhoto);
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

        if (!img) continue;  // ignorer si pas de photo

        var qte   = toNum(getCell(row, iQte));
        var reduc = (ancien > nouveau)
            ? Math.round((ancien - nouveau) / ancien * 100) : 0;

        result.push({
            id     : idx,
            name   : name,
            tailles: tailles,
            prix   : nouveau || prixBase,
            ancien : ancien,
            reduc  : reduc,
            img    : img,
            stock  : tailles.length > 0 || qte > 0
        });
    }

    return result;
}

// ============================================================
//  Rendu des cartes produits
// ============================================================
function renderProducts(list) {
    var grid = document.getElementById('productsGrid');
    document.getElementById('resultsCount').textContent =
        list.length + ' article' + (list.length !== 1 ? 's' : '');

    if (!list.length) {
        grid.innerHTML = '<div class="no-results"><p>Aucun article</p></div>';
        return;
    }

    var html = '';
    for (var i = 0; i < list.length; i++) {
        html += cardHTML(list[i]);
    }
    grid.innerHTML = html;

    // Attacher les événements
    var cards = grid.querySelectorAll('.product-card');
    for (var ci = 0; ci < cards.length; ci++) {
        attachCard(cards[ci]);
    }
}

function attachCard(card) {
    var pid = parseInt(card.dataset.id, 10);

    var sizeBtns = card.querySelectorAll('.size-tag');
    for (var si = 0; si < sizeBtns.length; si++) {
        (function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                for (var x = 0; x < sizeBtns.length; x++) sizeBtns[x].classList.remove('selected');
                btn.classList.add('selected');
                selSizes[pid] = btn.dataset.size;
            });
        })(sizeBtns[si]);
    }

    var addBtn = card.querySelector('.add-btn');
    if (addBtn) {
        addBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var p = findProduct(pid);
            addToCart(p, selSizes[pid]);
        });
    }

    card.addEventListener('click', function() { openModal(pid); });
}

function cardHTML(p) {
    var ref = p.img ? p.img.split('/').pop().replace(/\.[^.]+$/, '') : '';

    var imgTag = '<img class="card-img" src="' + esc(p.img) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="imgErr(this)">' +
                 '<div class="card-img-placeholder" style="display:none"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>Photo bientôt</span></div>';

    var priceTag = p.ancien > 0
        ? '<div class="card-price-old">' + fmt(p.ancien) + '</div><div class="card-price-new">' + fmt(p.prix) + '</div>'
        : '<div class="card-price-normal">' + fmt(p.prix) + '</div>';

    var sizesTag = '';
    if (p.tailles && p.tailles.length > 0) {
        sizesTag = '<div class="card-sizes">';
        for (var i = 0; i < p.tailles.length; i++) {
            sizesTag += '<span class="size-tag" data-size="' + esc(p.tailles[i]) + '">' + esc(p.tailles[i]) + '</span>';
        }
        sizesTag += '</div>';
    } else {
        sizesTag = '<span class="no-size">Taille unique</span>';
    }

    return '<div class="product-card promo-card" data-id="' + p.id + '">' +
        '<div class="card-img-wrap">' +
            imgTag +
            '<span class="promo-badge">Solde</span>' +
            (p.reduc > 0 ? '<span class="discount-badge">-' + p.reduc + '%</span>' : '') +
        '</div>' +
        '<div class="card-body">' +
            '<div class="card-name">' + esc(p.name) + '</div>' +
            (ref ? '<div style="color:#aaa;font-size:11px">Réf. ' + esc(ref) + '</div>' : '') +
            priceTag +
            sizesTag +
        '</div>' +
        '<div class="card-footer">' +
            '<button class="add-btn"' + (p.stock ? '' : ' disabled') + '>' +
            (p.stock ? '+ Ajouter au panier' : 'Épuisé') + '</button>' +
        '</div>' +
    '</div>';
}

function imgErr(el) {
    el.style.display = 'none';
    if (el.nextElementSibling) el.nextElementSibling.style.display = 'flex';
}

// ============================================================
//  Filtres
// ============================================================
function buildFilters() {
    var cats = [];
    var seen = {};
    for (var i = 0; i < promoProducts.length; i++) {
        var n = promoProducts[i].name;
        if (n && !seen[n]) { cats.push(n); seen[n] = true; }
    }
    cats.sort();

    var catSel = document.getElementById('categoryFilter');
    catSel.innerHTML = '<option value="">Toutes catégories</option>';
    for (var c = 0; c < cats.length; c++) {
        catSel.innerHTML += '<option value="' + esc(cats[c]) + '">' + esc(cats[c]) + '</option>';
    }

    var allSizes = [];
    var seenS = {};
    for (var p = 0; p < promoProducts.length; p++) {
        var t = promoProducts[p].tailles;
        for (var s = 0; s < t.length; s++) {
            if (!seenS[t[s]]) { allSizes.push(t[s]); seenS[t[s]] = true; }
        }
    }
    allSizes.sort(function(a, b) {
        var na = parseFloat(a), nb = parseFloat(b);
        return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b);
    });

    var sizeSel = document.getElementById('sizeFilter');
    sizeSel.innerHTML = '<option value="">Toutes tailles</option>';
    for (var sz = 0; sz < allSizes.length; sz++) {
        sizeSel.innerHTML += '<option value="' + esc(allSizes[sz]) + '">' + esc(allSizes[sz]) + '</option>';
    }
}

function applyFilters() {
    var q    = document.getElementById('searchInput').value.toLowerCase().trim();
    var cat  = document.getElementById('categoryFilter').value;
    var size = document.getElementById('sizeFilter').value;

    var list = [];
    for (var i = 0; i < promoProducts.length; i++) {
        var p = promoProducts[i];
        var okQ    = !q    || p.name.toLowerCase().indexOf(q) !== -1;
        var okCat  = !cat  || p.name === cat;
        var okSize = !size;
        if (!okSize) {
            for (var s = 0; s < p.tailles.length; s++) {
                if (p.tailles[s] === size) { okSize = true; break; }
            }
        }
        if (okQ && okCat && okSize) list.push(p);
    }
    renderProducts(list);
}

// ============================================================
//  Modal
// ============================================================
function findProduct(id) {
    for (var i = 0; i < promoProducts.length; i++) {
        if (promoProducts[i].id === id) return promoProducts[i];
    }
    return null;
}

function openModal(id) {
    var p = findProduct(id);
    if (!p) return;

    var imgTag = '<img class="modal-img" src="' + esc(p.img) + '" alt="' + esc(p.name) +
                 '" onerror="this.outerHTML=\'<div class=modal-img-placeholder><span>Samel</span></div>\'">';

    var priceTag = p.ancien > 0
        ? '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">' +
          '<div class="card-price-old" style="font-size:16px">' + fmt(p.ancien) + '</div>' +
          '<div class="card-price-new" style="font-size:26px">' + fmt(p.prix) + '</div>' +
          (p.reduc > 0 ? '<span class="discount-badge" style="position:static;width:44px;height:44px;font-size:13px">-' + p.reduc + '%</span>' : '') +
          '</div>'
        : '<div class="modal-price">' + fmt(p.prix) + '</div>';

    var sizeBtns = '';
    for (var s = 0; s < p.tailles.length; s++) {
        sizeBtns += '<button class="modal-size-btn" data-size="' + esc(p.tailles[s]) + '">' + esc(p.tailles[s]) + '</button>';
    }

    document.getElementById('modalContent').innerHTML =
        '<div style="background:linear-gradient(135deg,#ff6f00,#f57c00);color:white;padding:8px;text-align:center;font-weight:700;font-size:13px">🔥 ARTICLE EN PROMOTION</div>' +
        imgTag +
        '<div class="modal-body">' +
            '<div class="modal-name">' + esc(p.name) + '</div>' +
            priceTag +
            (p.tailles.length ? '<div class="modal-sizes-label">Choisir votre taille :</div>' : '') +
            '<div class="modal-sizes">' + (sizeBtns || '<span style="color:#aaa;font-size:13px">Taille unique</span>') + '</div>' +
            '<button class="modal-add-btn" id="modalAddBtn"' + (p.stock ? '' : ' disabled') + '>' +
            (p.stock ? '+ Ajouter au panier' : 'Épuisé') + '</button>' +
        '</div>';

    var selSize = selSizes[id] || null;

    var modalBtns = document.querySelectorAll('.modal-size-btn');
    for (var mi = 0; mi < modalBtns.length; mi++) {
        (function(btn) {
            if (btn.dataset.size === selSize) btn.classList.add('selected');
            btn.addEventListener('click', function() {
                for (var x = 0; x < modalBtns.length; x++) modalBtns[x].classList.remove('selected');
                btn.classList.add('selected');
                selSize = btn.dataset.size;
                selSizes[id] = selSize;
            });
        })(modalBtns[mi]);
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
    if (product.tailles && product.tailles.length > 0 && !taille) {
        alert('Veuillez choisir une taille !');
        return;
    }
    var key = product.id + '_' + (taille || 'u');
    var existing = null;
    for (var i = 0; i < cart.length; i++) {
        if (cart[i].key === key) { existing = cart[i]; break; }
    }
    if (existing) {
        existing.qty++;
    } else {
        cart.push({ key: key, product: product, taille: taille || 'Taille unique', qty: 1 });
    }
    renderCart();
    openCart();
    var btn = document.getElementById('cartBtn');
    btn.style.transform = 'scale(1.1)';
    setTimeout(function() { btn.style.transform = ''; }, 200);
}

function removeFromCart(key) {
    var newCart = [];
    for (var i = 0; i < cart.length; i++) {
        if (cart[i].key !== key) newCart.push(cart[i]);
    }
    cart = newCart;
    renderCart();
}

function updateQty(key, delta) {
    for (var i = 0; i < cart.length; i++) {
        if (cart[i].key === key) {
            cart[i].qty = Math.max(1, cart[i].qty + delta);
            break;
        }
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

    var grandTotal = 0;
    for (var j = 0; j < cart.length; j++) grandTotal += cart[j].product.prix * cart[j].qty;
    footerEl.style.display = 'block';
    document.getElementById('cartTotal').textContent = fmt(grandTotal);

    var html = '';
    for (var k = 0; k < cart.length; k++) {
        var item = cart[k];
        var imgTag = '<img class="cart-item-img" src="' + esc(item.product.img) + '" alt="" onerror="this.style.display=\'none\'">';
        html += '<div class="cart-item">' +
            imgTag +
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
            '</div>' +
        '</div>';
    }
    itemsEl.innerHTML = html;
}

function openCart()  {
    document.getElementById('cartSidebar').classList.add('open');
    document.getElementById('overlay').classList.add('active');
}
function closeCart() {
    document.getElementById('cartSidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('active');
}

// ============================================================
//  Commande WhatsApp
// ============================================================
function sendOrder() {
    if (!cart.length) return;
    var lines = [];
    var total = 0;
    for (var i = 0; i < cart.length; i++) {
        var item = cart[i];
        lines.push((i+1) + '. ' + item.product.name + ' | Taille: ' + item.taille + ' | Qté: ' + item.qty + ' | ' + fmt(item.product.prix * item.qty) + ' 🔥');
        total += item.product.prix * item.qty;
    }
    var msg = '✨ *Nouvelle commande Samel*\n\n' +
              lines.join('\n') + '\n\n' +
              '💰 *Total : ' + fmt(total) + '*\n\n' +
              '📦 Paiement à la livraison (COD)\n\n' +
              '📝 Merci d\'indiquer votre nom et adresse.';

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
    return String(s || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ============================================================
//  Initialisation
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
