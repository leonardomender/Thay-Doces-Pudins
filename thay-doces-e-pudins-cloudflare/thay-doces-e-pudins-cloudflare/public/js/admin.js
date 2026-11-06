// Arquivo externo (a CSP bloqueia scripts inline).
// 1) Pré-visualização da imagem  2) Reduz a foto antes de enviar (cabe no banco e carrega rápido)
// 3) Confirmação antes de excluir
(function () {
  var input = document.getElementById("imagem");
  var previa = document.getElementById("previa");
  var form = document.getElementById("form-produto");
  var MAX = 900; // lado maior da imagem, em pixels

  if (input && previa) {
    input.addEventListener("change", function () {
      var arquivo = input.files && input.files[0];
      if (!arquivo) { return; }
      previa.src = URL.createObjectURL(arquivo);
      previa.hidden = false;
    });
  }

  function reduzir(arquivo) {
    return new Promise(function (ok, falha) {
      var img = new Image();
      var url = URL.createObjectURL(arquivo);
      img.onload = function () {
        var esc = Math.min(1, MAX / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * esc);
        c.height = Math.round(img.height * esc);
        var g = c.getContext("2d");
        g.fillStyle = "#ffffff";           // fundo branco (PNG transparente vira JPG)
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (blob) { URL.revokeObjectURL(url); blob ? ok(blob) : falha(); }, "image/jpeg", 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); falha(); };
      img.src = url;
    });
  }

  if (form && input) {
    form.addEventListener("submit", function (e) {
      var arquivo = input.files && input.files[0];
      if (!arquivo || form.dataset.pronto) { return; }
      e.preventDefault();
      reduzir(arquivo).then(function (blob) {
        var novo = new File([blob], "imagem.jpg", { type: "image/jpeg" });
        var dt = new DataTransfer();
        dt.items.add(novo);
        input.files = dt.files;
      }).catch(function () { /* se falhar, envia o original; o servidor confere o tamanho */ })
        .then(function () { form.dataset.pronto = "1"; form.submit(); });
    });
  }

  document.querySelectorAll(".form-excluir").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      if (!confirm("Excluir este produto e a imagem dele?")) { e.preventDefault(); }
    });
  });
  document.querySelectorAll(".form-excluir-pedido").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      if (!confirm("Excluir este pedido? Essa ação não pode ser desfeita.")) { e.preventDefault(); }
    });
  });
})();
