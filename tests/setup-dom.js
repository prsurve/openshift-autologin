const origGetElementById = document.getElementById.bind(document);

document.getElementById = function (id) {
  const el = origGetElementById(id);
  if (el) return el;

  const stub = document.createElement('div');
  stub.id = id;
  stub.value = '';
  stub.type = 'text';
  stub.style.display = '';
  stub.files = [];
  document.body.appendChild(stub);
  return stub;
};
