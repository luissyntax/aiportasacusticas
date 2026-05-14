/**
 * Página Orçamento — atualiza o preview em tempo real e gera o PDF
 * nativamente com jsPDF (texto vetorial + imagens via addImage),
 * garantindo qualidade de impressão e arquivo leve.
 *
 * Sem back end: tudo é processado no navegador.
 */
(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Constantes de layout do PDF (mm). Mesmo padrão de js/spec-pdf.js.
  // -----------------------------------------------------------------------
  var HEADER_H_MM = 26;
  var FOOTER_H_MM = 22;
  var MARGIN_X_MM = 10;
  var LOGO_REL_PATH = '../images/logos/logo-preta-transparente.png';
  var LOGO_ASPECT = 168 / 52;

  var COMPANY = {
    name: 'Arte Interiores',
    cnpj: '59.040.631/0001-87',
    phone: '(61) 99630-5986 · WhatsApp',
    site: 'https://www.aiportasacusticas.com.br/',
    siteShort: 'aiportasacusticas.com.br'
  };

  var brl = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  // -----------------------------------------------------------------------
  // Estado
  // -----------------------------------------------------------------------
  /** @type {Array<{id:string, modelo:string, cor:string, larg:number, alt:number, qtd:number, unit:number, imgDataUrl:string|null}>} */
  var items = [];
  var itemCounter = 0;

  // -----------------------------------------------------------------------
  // Utilitários
  // -----------------------------------------------------------------------
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function uid() {
    itemCounter += 1;
    return 'orc-' + Date.now().toString(36) + '-' + itemCounter;
  }
  function parseMoney(value) {
    if (value == null) return 0;
    var s = String(value).trim();
    if (!s) return 0;
    s = s.replace(/[^0-9.,\-]/g, '');
    if (s.indexOf(',') > -1) {
      s = s.replace(/\./g, '').replace(',', '.');
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function fmtMoney(n) {
    return brl.format(n || 0);
  }
  function fmtDateBR(d) {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function pad(n, len) {
    var s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  }
  function gerarNumero() {
    var d = new Date();
    var rnd = Math.floor(Math.random() * 9000 + 1000);
    return d.getFullYear() + '/' + pad(d.getDate(), 2) + '/' + pad(d.getMonth() + 1, 2) + '-' + rnd;
  }
  function maskCPF(v) {
    return String(v || '')
      .replace(/\D/g, '')
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  function maskPhone(v) {
    var d = String(v || '').replace(/\D/g, '').slice(0, 11);
    if (d.length <= 10) {
      return d
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return d
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2');
  }
  function libsReady() {
    return !!(window.jspdf && window.jspdf.jsPDF);
  }

  /**
   * Normaliza uma imagem para JPEG redimensionado (lado máx. MAX px).
   * Garante compatibilidade total com jsPDF (que não aceita WEBP/HEIC)
   * e mantém o PDF leve.
   * @returns {Promise<{dataUrl:string,w:number,h:number}>}
   */
  function normalizeImage(file, MAX) {
    MAX = MAX || 900;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (w >= h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        else if (h > w && h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        try {
          resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.9), w: w, h: h });
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Falha ao ler a imagem'));
      };
      img.src = url;
    });
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // -----------------------------------------------------------------------
  // Itens dinâmicos
  // -----------------------------------------------------------------------
  function addItem() {
    var tpl = $('#orc-item-template');
    if (!tpl) return;
    var frag = tpl.content.cloneNode(true);
    var card = frag.querySelector('[data-orc-item]');
    var id = uid();
    card.dataset.id = id;

    items.push({
      id: id,
      modelo: 'Linha residencial — folha 42 mm (Rw ≈ 30 dB)',
      cor: '',
      larg: 0,
      alt: 0,
      qtd: 1,
      unit: 0,
      imgDataUrl: null
    });

    var inputs = {
      modelo: card.querySelector('[data-orc-modelo]'),
      cor: card.querySelector('[data-orc-cor]'),
      larg: card.querySelector('[data-orc-larg]'),
      alt: card.querySelector('[data-orc-alt]'),
      qtd: card.querySelector('[data-orc-qtd]'),
      unit: card.querySelector('[data-orc-unit]'),
      img: card.querySelector('[data-orc-img]')
    };

    function findItem() {
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === id) return items[i];
      }
      return null;
    }

    function onChange() {
      var it = findItem();
      if (!it) return;
      it.modelo = inputs.modelo.value;
      it.cor = inputs.cor.value;
      it.larg = parseFloat(inputs.larg.value) || 0;
      it.alt = parseFloat(inputs.alt.value) || 0;
      it.qtd = Math.max(1, parseInt(inputs.qtd.value, 10) || 1);
      it.unit = parseMoney(inputs.unit.value);
      updateItemSubtotal(card, it);
      renderPreview();
    }

    inputs.modelo.addEventListener('change', onChange);
    inputs.cor.addEventListener('input', onChange);
    inputs.larg.addEventListener('input', onChange);
    inputs.alt.addEventListener('input', onChange);
    inputs.qtd.addEventListener('input', onChange);
    inputs.unit.addEventListener('input', onChange);
    inputs.unit.addEventListener('blur', function () {
      var n = parseMoney(inputs.unit.value);
      if (n > 0) inputs.unit.value = n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      onChange();
    });

    var imgName = card.querySelector('[data-orc-img-name]');
    var imgPreview = card.querySelector('[data-orc-img-preview]');
    inputs.img.addEventListener('change', function () {
      var file = inputs.img.files && inputs.img.files[0];
      if (!file) return;
      if (imgName) imgName.textContent = 'Processando…';
      normalizeImage(file, 900)
        .then(function (result) {
          var it = findItem();
          if (it) it.imgDataUrl = result.dataUrl;
          if (imgName) imgName.textContent = file.name;
          if (imgPreview) {
            imgPreview.style.backgroundImage = 'url("' + result.dataUrl + '")';
            imgPreview.setAttribute('data-filled', 'true');
          }
          renderPreview();
        })
        .catch(function (err) {
          console.error(err);
          if (imgName) imgName.textContent = 'Não foi possível ler essa imagem';
        });
    });

    card.querySelector('[data-orc-remove]').addEventListener('click', function () {
      items = items.filter(function (i) { return i.id !== id; });
      card.remove();
      reindexItems();
      renderPreview();
    });

    $('#orc-items').appendChild(card);
    reindexItems();
    renderPreview();
  }

  function reindexItems() {
    $$('[data-orc-item-num]').forEach(function (el, idx) {
      el.textContent = pad(idx + 1, 2);
    });
  }

  function updateItemSubtotal(card, it) {
    var sub = (it.qtd || 0) * (it.unit || 0);
    var el = card.querySelector('[data-orc-subtotal]');
    if (el) el.textContent = fmtMoney(sub);
  }

  // -----------------------------------------------------------------------
  // Preview (sincroniza com o DOM)
  // -----------------------------------------------------------------------
  function renderPreview() {
    $('#prev-cli-nome').textContent = $('#cli-nome').value.trim() || '—';
    $('#prev-cli-cpf').textContent = $('#cli-cpf').value.trim() || '—';
    $('#prev-cli-endereco').textContent = $('#cli-endereco').value.trim() || '—';
    $('#prev-cli-telefone').textContent = $('#cli-telefone').value.trim() || '—';
    $('#prev-cli-email').textContent = $('#cli-email').value.trim() || '—';

    var adicional = $('#orc-adicional').value.trim();
    var section = $('#prev-adicional-section');
    if (adicional) {
      section.setAttribute('data-empty', 'false');
      $('#prev-adicional').textContent = adicional;
    } else {
      section.setAttribute('data-empty', 'true');
      $('#prev-adicional').textContent = '—';
    }

    var container = $('#prev-itens');
    container.innerHTML = '';
    var total = 0;

    items.forEach(function (it, idx) {
      var sub = (it.qtd || 0) * (it.unit || 0);
      total += sub;

      var hasImg = !!it.imgDataUrl;
      var imgTag = hasImg
        ? '<img src="' + it.imgDataUrl + '" alt="Cor do revestimento" crossorigin="anonymous">'
        : '';

      // Só mostra cada campo quando há valor — evita "— · medidas", "1 · qtd." vazios.
      var metaBits = [];
      if (it.larg && it.alt) {
        metaBits.push('<span><strong>' + it.larg + ' × ' + it.alt + ' mm</strong> · medidas</span>');
      } else if (it.larg) {
        metaBits.push('<span><strong>' + it.larg + ' mm</strong> · largura</span>');
      } else if (it.alt) {
        metaBits.push('<span><strong>' + it.alt + ' mm</strong> · altura</span>');
      }
      if (it.qtd > 0) {
        metaBits.push('<span><strong>' + it.qtd + '</strong> · qtd.</span>');
      }
      if (it.unit > 0) {
        metaBits.push('<span>Unitário: <strong>' + fmtMoney(it.unit) + '</strong></span>');
      }

      var html =
        '<article class="orc-doc-item">' +
          '<div class="orc-doc-item__color" data-filled="' + (hasImg ? 'true' : 'false') + '" role="img" aria-label="Cor do revestimento">' + imgTag + '</div>' +
          '<div class="orc-doc-item__body">' +
            '<h4 class="orc-doc-item__model">' + pad(idx + 1, 2) + ' · ' + escapeHtml(it.modelo) + '</h4>' +
            (it.cor ? '<span class="orc-doc-item__cor">Cor: ' + escapeHtml(it.cor) + '</span>' : '') +
            (metaBits.length ? '<div class="orc-doc-item__meta">' + metaBits.join('') + '</div>' : '') +
          '</div>' +
          '<div class="orc-doc-item__money">' +
            '<span class="orc-doc-item__money-label">Subtotal</span>' +
            '<span class="orc-doc-item__money-value">' + fmtMoney(sub) + '</span>' +
            (it.unit > 0
              ? '<span class="orc-doc-item__unit">' + (it.qtd || 1) + ' × ' + fmtMoney(it.unit) + '</span>'
              : '') +
          '</div>' +
        '</article>';

      container.insertAdjacentHTML('beforeend', html);
    });

    $('#prev-total').textContent = fmtMoney(total);
  }

  // -----------------------------------------------------------------------
  // Geração do PDF (nativa, com jsPDF — texto vetorial + imagens)
  // -----------------------------------------------------------------------
  function loadLogoAsDataUrl(path) {
    return fetch(path || LOGO_REL_PATH, { credentials: 'same-origin' })
      .then(function (res) { return res.ok ? res.blob() : null; })
      .then(function (blob) {
        if (!blob) return null;
        return new Promise(function (resolve) {
          var r = new FileReader();
          r.onloadend = function () { resolve(typeof r.result === 'string' ? r.result : null); };
          r.onerror = function () { resolve(null); };
          r.readAsDataURL(blob);
        });
      })
      .catch(function () { return null; });
  }

  // Paleta do site (RGB)
  var COL = {
    ink: [1, 3, 0],
    teal: [49, 76, 83],
    sage: [90, 127, 120],
    mint: [187, 222, 198],
    muted: [238, 241, 244],
    line: [220, 225, 228],
    text: [40, 45, 48],
    placeholder: [230, 236, 239]
  };
  function setFill(pdf, c) { pdf.setFillColor(c[0], c[1], c[2]); }
  function setDraw(pdf, c) { pdf.setDrawColor(c[0], c[1], c[2]); }
  function setText(pdf, c) { pdf.setTextColor(c[0], c[1], c[2]); }

  function drawPageHeader(pdf, pdfW, logoDataUrl) {
    setFill(pdf, COL.muted);
    pdf.rect(0, 0, pdfW, HEADER_H_MM, 'F');
    setDraw(pdf, COL.teal);
    pdf.setLineWidth(0.4);
    pdf.line(0, HEADER_H_MM - 0.45, pdfW, HEADER_H_MM - 0.45);

    var logoH = 11;
    if (logoDataUrl) {
      try {
        pdf.addImage(
          logoDataUrl, 'PNG',
          MARGIN_X_MM, (HEADER_H_MM - logoH) / 2,
          logoH * LOGO_ASPECT, logoH
        );
      } catch (e) { /* logo opcional */ }
    }

    setText(pdf, COL.teal);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.text(COMPANY.name, pdfW - MARGIN_X_MM, 9.5, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    setText(pdf, COL.sage);
    pdf.text('CNPJ ' + COMPANY.cnpj, pdfW - MARGIN_X_MM, 14.5, { align: 'right' });
    pdf.text(COMPANY.phone + '  ·  ' + COMPANY.siteShort, pdfW - MARGIN_X_MM, 19.2, { align: 'right' });
  }

  function drawPageFooter(pdf, pdfW, pdfH, pageNum, totalPages) {
    var top = pdfH - FOOTER_H_MM;
    setFill(pdf, COL.muted);
    pdf.rect(0, top, pdfW, FOOTER_H_MM, 'F');
    pdf.setDrawColor(187, 200, 208);
    pdf.setLineWidth(0.35);
    pdf.line(0, top + 0.55, pdfW, top + 0.55);

    setText(pdf, COL.sage);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    var note = 'Proposta sujeita à medição em obra. Garantia de 1 ano sobre fabricação e instalação. Validade da proposta: 7 dias.';
    var noteLines = pdf.splitTextToSize(note, pdfW - MARGIN_X_MM * 2);
    pdf.text(noteLines, MARGIN_X_MM, top + 6);

    pdf.setTextColor(110, 118, 124);
    pdf.setFontSize(7.5);
    var brand =
      COMPANY.name + ' · CNPJ ' + COMPANY.cnpj + ' · ' + COMPANY.siteShort +
      ' · ' + fmtDateBR(new Date());
    pdf.text(brand, MARGIN_X_MM, top + FOOTER_H_MM - 5);

    pdf.text('Página ' + pageNum + ' de ' + totalPages, pdfW - MARGIN_X_MM, top + FOOTER_H_MM - 5, { align: 'right' });
  }

  function drawSectionTitle(pdf, x, y, num, title) {
    // Pílula com número (mint) + título (teal, serifa)
    setFill(pdf, COL.mint);
    pdf.roundedRect(x, y - 4, 9, 5.5, 2.75, 2.75, 'F');
    setText(pdf, COL.ink);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text(num, x + 4.5, y - 0.3, { align: 'center' });

    setText(pdf, COL.teal);
    pdf.setFont('times', 'normal');
    pdf.setFontSize(13);
    pdf.text(title, x + 12, y);
  }

  function drawEyebrow(pdf, x, y, txt, opts) {
    setText(pdf, COL.sage);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    var o = { charSpace: 0.4 };
    if (opts && opts.align) o.align = opts.align;
    pdf.text(String(txt).toUpperCase(), x, y, o);
  }

  function drawKV(pdf, x, y, w, label, value) {
    drawEyebrow(pdf, x, y, label);
    setText(pdf, COL.ink);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    var lines = pdf.splitTextToSize(value || '—', w);
    pdf.text(lines, x, y + 4.6);
    return lines.length * 4.6 + 6; // altura usada
  }

  function getItemsForPdf() {
    // Coleta o estado atual do formulário (idêntico ao usado no preview)
    return items.map(function (it, idx) {
      return {
        idx: idx + 1,
        modelo: it.modelo || '',
        cor: it.cor || '',
        larg: it.larg || 0,
        alt: it.alt || 0,
        qtd: it.qtd || 1,
        unit: it.unit || 0,
        sub: (it.qtd || 0) * (it.unit || 0),
        imgDataUrl: it.imgDataUrl || null
      };
    });
  }

  function getClienteForPdf() {
    return {
      nome: $('#cli-nome').value.trim() || '—',
      cpf: $('#cli-cpf').value.trim() || '—',
      endereco: $('#cli-endereco').value.trim() || '—',
      telefone: $('#cli-telefone').value.trim() || '—',
      email: $('#cli-email').value.trim() || '—'
    };
  }

  /**
   * Constrói o PDF nativamente.
   * @param {string|null} logoDataUrl
   * @param {string} numero
   * @param {string} fileName
   */
  function buildPdf(logoDataUrl, numero, fileName) {
    var jsPDF = window.jspdf.jsPDF;
    var pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    var pdfW = pdf.internal.pageSize.getWidth();   // 210
    var pdfH = pdf.internal.pageSize.getHeight();  // 297
    var MX = 14;
    var contentW = pdfW - MX * 2;
    var bottomLimit = pdfH - FOOTER_H_MM - 6;
    var topStart = HEADER_H_MM + 10;
    var y = topStart;

    drawPageHeader(pdf, pdfW, logoDataUrl);

    function newPage() {
      pdf.addPage();
      drawPageHeader(pdf, pdfW, logoDataUrl);
      y = topStart;
    }
    function ensure(need) {
      if (y + need > bottomLimit) newPage();
    }

    // ---------------------------------------------------------------
    // 1) BLOCO “PROPOSTA DE ORÇAMENTO” + meta (Nº, Data, Validade)
    // ---------------------------------------------------------------
    drawEyebrow(pdf, MX, y, 'Documento');
    setText(pdf, COL.ink);
    pdf.setFont('times', 'normal');
    pdf.setFontSize(22);
    pdf.text('Proposta de orçamento', MX, y + 9);

    // Bloco lateral com Nº/Data/Validade
    var metaX = pdfW - MX;
    drawEyebrow(pdf, metaX - 56, y, 'Nº');
    drawEyebrow(pdf, metaX - 30, y, 'Data');
    drawEyebrow(pdf, metaX, y, 'Validade', { align: 'right' });
    setText(pdf, COL.ink);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(numero, metaX - 56, y + 5.5);
    pdf.text(fmtDateBR(new Date()), metaX - 30, y + 5.5);
    pdf.text('7 dias', metaX, y + 5.5, { align: 'right' });

    y += 14;

    // Linha teal de separação
    setDraw(pdf, COL.teal);
    pdf.setLineWidth(0.5);
    pdf.line(MX, y, pdfW - MX, y);
    y += 7;

    // ---------------------------------------------------------------
    // 2) CLIENTE
    // ---------------------------------------------------------------
    var cli = getClienteForPdf();
    ensure(40);
    drawSectionTitle(pdf, MX, y, '01', 'Cliente');
    y += 10;

    var colW = (contentW - 8) / 2;
    var colLX = MX, colRX = MX + colW + 8;

    var hL = drawKV(pdf, colLX, y, colW, 'Nome', cli.nome);
    var hR = drawKV(pdf, colRX, y, colW, 'CPF', cli.cpf);
    y += Math.max(hL, hR);

    y += drawKV(pdf, MX, y, contentW, 'Endereço', cli.endereco);

    hL = drawKV(pdf, colLX, y, colW, 'Telefone', cli.telefone);
    hR = drawKV(pdf, colRX, y, colW, 'E-mail', cli.email);
    y += Math.max(hL, hR);

    y += 4;
    setDraw(pdf, COL.line);
    pdf.setLineWidth(0.3);
    pdf.line(MX, y, pdfW - MX, y);
    y += 6;

    // ---------------------------------------------------------------
    // 3) ITENS DA PROPOSTA
    // ---------------------------------------------------------------
    var itens = getItemsForPdf();
    var total = 0;

    ensure(20);
    drawSectionTitle(pdf, MX, y, '02', 'Itens da proposta');
    y += 10;

    if (!itens.length) {
      setText(pdf, COL.sage);
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(9);
      pdf.text('Nenhum item adicionado.', MX, y);
      y += 8;
    }

    itens.forEach(function (it) {
      total += it.sub;

      // Calcula altura dinâmica do card a partir do conteúdo de texto
      pdf.setFont('times', 'normal');
      pdf.setFontSize(11);
      var modeloLines = pdf.splitTextToSize(pad(it.idx, 2) + ' · ' + it.modelo, contentW - 36 - 50);
      var bodyTextH = modeloLines.length * 4.6 + (it.cor ? 5 : 0) + 5; // título + cor + meta
      var cardH = Math.max(32, bodyTextH + 8);

      ensure(cardH + 4);

      // Card
      setDraw(pdf, COL.line);
      pdf.setLineWidth(0.3);
      setFill(pdf, [252, 253, 254]);
      pdf.roundedRect(MX, y, contentW, cardH, 2.5, 2.5, 'FD');

      // Caixa da imagem (32×32 mm)
      var boxS = cardH - 6;
      var boxX = MX + 3;
      var boxY = y + 3;
      setFill(pdf, COL.placeholder);
      pdf.roundedRect(boxX, boxY, boxS, boxS, 1.8, 1.8, 'F');

      if (it.imgDataUrl) {
        try {
          pdf.addImage(it.imgDataUrl, 'JPEG', boxX, boxY, boxS, boxS, undefined, 'FAST');
        } catch (e) {
          // Se por alguma razão a imagem não puder ser adicionada,
          // mostra um aviso visual em vez de quebrar o PDF.
          setText(pdf, COL.sage);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(6.5);
          pdf.text('IMAGEM\nNÃO LIDA', boxX + boxS / 2, boxY + boxS / 2 - 1,
            { align: 'center', baseline: 'middle' });
        }
      } else {
        setText(pdf, COL.sage);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.5);
        pdf.text('SEM IMAGEM', boxX + boxS / 2, boxY + boxS / 2,
          { align: 'center', baseline: 'middle' });
      }

      // Corpo (centro)
      var bodyX = boxX + boxS + 5;
      var bodyW = contentW - boxS - 5 - 6 - 48; // restando 48mm para money
      var bodyY = y + 6;

      setText(pdf, COL.ink);
      pdf.setFont('times', 'normal');
      pdf.setFontSize(11);
      pdf.text(modeloLines, bodyX, bodyY);
      bodyY += modeloLines.length * 4.6 + 0.5;

      if (it.cor) {
        setText(pdf, COL.teal);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.text('Cor: ' + it.cor, bodyX, bodyY);
        bodyY += 4.5;
      }

      var medidas = (it.larg && it.alt)
        ? (it.larg + ' × ' + it.alt + ' mm')
        : (it.larg ? (it.larg + ' mm (L)') : (it.alt ? (it.alt + ' mm (A)') : '—'));

      setText(pdf, COL.sage);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      var metaTxt = 'Medidas: ' + medidas + '   ·   Qtd.: ' + it.qtd + '   ·   Unitário: ' + fmtMoney(it.unit);
      pdf.text(metaTxt, bodyX, y + cardH - 4.5);

      // Money (direita)
      var moneyX = MX + contentW - 4;
      drawEyebrow(pdf, moneyX, y + 5, 'Subtotal', { align: 'right' });
      setText(pdf, COL.teal);
      pdf.setFont('times', 'normal');
      pdf.setFontSize(14);
      pdf.text(fmtMoney(it.sub), moneyX, y + 12.5, { align: 'right' });

      y += cardH + 3;
    });

    // ---------------------------------------------------------------
    // 4) TOTAL GERAL (banner teal)
    // ---------------------------------------------------------------
    var bannerH = 14;
    ensure(bannerH + 4);
    setFill(pdf, COL.teal);
    pdf.roundedRect(MX, y, contentW, bannerH, 2.5, 2.5, 'F');

    setText(pdf, COL.mint);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text('TOTAL GERAL', MX + 4, y + 8.5, { charSpace: 0.6 });

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('times', 'normal');
    pdf.setFontSize(16);
    pdf.text(fmtMoney(total), MX + contentW - 4, y + 9.5, { align: 'right' });

    y += bannerH + 8;

    // ---------------------------------------------------------------
    // 5) INFORMAÇÕES ADICIONAIS (opcional)
    // ---------------------------------------------------------------
    var adicional = $('#orc-adicional').value.trim();
    if (adicional) {
      ensure(24);
      drawSectionTitle(pdf, MX, y, '03', 'Informações adicionais');
      y += 9;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      setText(pdf, COL.text);
      var lines = pdf.splitTextToSize(adicional, contentW - 8);
      var blockH = lines.length * 5 + 7;

      // Quebra de página se necessário
      if (y + blockH > bottomLimit) newPage();

      // Barra mint à esquerda + fundo claro
      setFill(pdf, COL.mint);
      pdf.rect(MX, y, 1.5, blockH, 'F');
      setFill(pdf, [245, 249, 247]);
      pdf.rect(MX + 1.5, y, contentW - 1.5, blockH, 'F');
      setText(pdf, COL.text);
      pdf.text(lines, MX + 6, y + 6);

      y += blockH + 6;
    }

    // ---------------------------------------------------------------
    // 6) ASSINATURA + nota final
    // ---------------------------------------------------------------
    ensure(20);
    y += 4;
    setDraw(pdf, [120, 130, 135]);
    pdf.setLineWidth(0.3);
    pdf.line(pdfW / 2 - 38, y, pdfW / 2 + 38, y);
    setText(pdf, COL.sage);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text('ASSINATURA · ' + COMPANY.name.toUpperCase(), pdfW / 2, y + 4, { align: 'center', charSpace: 0.6 });
    y += 9;

    setText(pdf, COL.sage);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    var foot = pdf.splitTextToSize(
      'Proposta sujeita à medição em obra. Valores e prazos podem ser ajustados após visita técnica. Garantia de 1 ano sobre fabricação e instalação.',
      contentW
    );
    pdf.text(foot, pdfW / 2, y, { align: 'center' });

    // ---------------------------------------------------------------
    // 7) Footers de todas as páginas (agora que sabemos o total)
    // ---------------------------------------------------------------
    var totalPages = pdf.getNumberOfPages();
    for (var p = 1; p <= totalPages; p++) {
      pdf.setPage(p);
      drawPageFooter(pdf, pdfW, pdfH, p, totalPages);
    }

    pdf.save(fileName);
  }

  function generatePdf() {
    var btn = $('#orc-generate');
    if (!btn) return;
    if (!libsReady()) {
      window.alert('Não foi possível carregar a biblioteca de PDF. Verifica a ligação à internet e tenta novamente.');
      return;
    }

    var clienteNome = ($('#cli-nome').value || 'cliente').trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'cliente';
    var numero = $('#prev-numero').textContent.trim();
    if (!numero || numero === '—') {
      numero = gerarNumero();
      $('#prev-numero').textContent = numero;
    }
    $('#prev-data').textContent = fmtDateBR(new Date());

    var originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="ai-btn__row"><span>Gerando PDF…</span></span>';

    loadLogoAsDataUrl(LOGO_REL_PATH)
      .then(function (logoDataUrl) {
        var numeroSafe = numero.replace(/[\/\\]/g, '-');
        var fileName = 'orcamento-' + numeroSafe + '-' + clienteNome + '.pdf';
        buildPdf(logoDataUrl, numero, fileName);
      })
      .catch(function (err) {
        console.error(err);
        window.alert('Não foi possível gerar o PDF agora. Tente novamente ou recarregue a página.');
      })
      .then(function () {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.innerHTML = originalHtml;
      });
  }

  // -----------------------------------------------------------------------
  // Geração de imagem (PNG) — screenshot do preview com html2canvas
  // -----------------------------------------------------------------------
  function generateImage() {
    var btn = $('#orc-image');
    var source = $('#orc-pdf-source');
    if (!btn || !source) return;
    if (typeof window.html2canvas === 'undefined') {
      window.alert('A biblioteca de imagem ainda está carregando. Aguarda alguns segundos e tenta de novo.');
      return;
    }

    var clienteNome = ($('#cli-nome').value || 'cliente').trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'cliente';
    var numero = $('#prev-numero').textContent.trim();
    if (!numero || numero === '—') {
      numero = gerarNumero();
      $('#prev-numero').textContent = numero;
    }
    $('#prev-data').textContent = fmtDateBR(new Date());
    var numeroSafe = numero.replace(/[\/\\]/g, '-');
    var fileName = 'orcamento-' + numeroSafe + '-' + clienteNome + '.png';

    var originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="ai-btn__row"><span>Gerando imagem…</span></span>';

    // Escala mais alta = imagem mais nítida (limite para evitar arquivos enormes)
    var scale = Math.min(3, Math.max(2, (window.devicePixelRatio || 1.5) * 1.5));
    var DOC_WIDTH = 794; // A4 retrato em ~96 dpi → layout desktop garantido

    window.html2canvas(source, {
      scale: scale,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: DOC_WIDTH,
      windowWidth: 1100, // garante que as @media (min-width:560/640) sejam aplicadas
      onclone: function (doc) {
        var cloneSource = doc.getElementById('orc-pdf-source');
        if (cloneSource) {
          cloneSource.classList.add('orc-pdf-clone');
          cloneSource.style.width = DOC_WIDTH + 'px';
          cloneSource.style.maxWidth = DOC_WIDTH + 'px';
          cloneSource.style.margin = '0';
        }
      }
    })
      .then(function (canvas) {
        return new Promise(function (resolve, reject) {
          if (canvas.toBlob) {
            canvas.toBlob(function (blob) {
              if (!blob) return reject(new Error('Falha ao criar a imagem.'));
              resolve(blob);
            }, 'image/png');
          } else {
            try {
              var dataUrl = canvas.toDataURL('image/png');
              var byteString = atob(dataUrl.split(',')[1]);
              var ab = new ArrayBuffer(byteString.length);
              var ia = new Uint8Array(ab);
              for (var i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
              resolve(new Blob([ab], { type: 'image/png' }));
            } catch (e) {
              reject(e);
            }
          }
        });
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          URL.revokeObjectURL(url);
          a.remove();
        }, 250);
      })
      .catch(function (err) {
        console.error(err);
        window.alert('Não foi possível gerar a imagem agora. Tente novamente.');
      })
      .then(function () {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.innerHTML = originalHtml;
      });
  }

  // -----------------------------------------------------------------------
  // Bindings iniciais
  // -----------------------------------------------------------------------
  function bind() {
    // Cabeçalho do documento — número e data
    $('#prev-numero').textContent = gerarNumero();
    $('#prev-data').textContent = fmtDateBR(new Date());

    // Inputs do cliente
    ['cli-nome', 'cli-endereco', 'cli-email'].forEach(function (id) {
      $('#' + id).addEventListener('input', renderPreview);
    });

    var cpfEl = $('#cli-cpf');
    cpfEl.addEventListener('input', function () {
      cpfEl.value = maskCPF(cpfEl.value);
      renderPreview();
    });

    var telEl = $('#cli-telefone');
    telEl.addEventListener('input', function () {
      telEl.value = maskPhone(telEl.value);
      renderPreview();
    });

    $('#orc-adicional').addEventListener('input', renderPreview);

    $('#orc-add-item').addEventListener('click', addItem);
    $('#orc-generate').addEventListener('click', generatePdf);
    $('#orc-image').addEventListener('click', generateImage);

    $('#orc-reset').addEventListener('click', function () {
      setTimeout(function () {
        items = [];
        $('#orc-items').innerHTML = '';
        $('#prev-numero').textContent = gerarNumero();
        $('#prev-data').textContent = fmtDateBR(new Date());
        renderPreview();
        addItem();
      }, 0);
    });

    // Primeira linha de item
    addItem();
    renderPreview();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
