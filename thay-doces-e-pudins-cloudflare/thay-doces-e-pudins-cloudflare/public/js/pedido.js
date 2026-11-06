// Arquivo externo (a CSP bloqueia scripts inline).
// Mostra o campo de endereço só quando o cliente escolhe "Entrega".
(function () {
  var tipo = document.getElementById("tipo");
  var campo = document.getElementById("campo-endereco");
  var endereco = document.getElementById("endereco");
  if (!tipo || !campo || !endereco) { return; }
  function atualizar() {
    var entrega = tipo.value === "entrega";
    campo.hidden = !entrega;
    endereco.required = entrega;
  }
  tipo.addEventListener("change", atualizar);
  atualizar();
})();
