const byId = (id) => document.getElementById(id);
const input = byId('file');
const choose = byId('choose');
const check = byId('check');
const form = choose.closest('article');
const report = byId('report');
const viewer = byId('document-viewer');
const preview = byId('view-document');
const result = byId('result');

const child = (element, name) => Array.from(element?.children ?? [])
  .find((item) => item.localName === name && item.namespaceURI === element.namespaceURI);
const value = (element, name) => child(element, name)?.textContent.trim();
const date = (text) => /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.split('-').reverse().join('/') : text;
const signatureCount = (element) => Array.from(element?.children ?? [])
  .filter((item) => item.localName === 'Signature' && item.namespaceURI === 'http://www.w3.org/2000/09/xmldsig#').length;

function fillFields(list, fields) {
  list.replaceChildren();
  for (const [label, value] of fields) {
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value || 'Não informado';
    list.append(term, description);
  }
}

function addPanel(container, label, entries) {
  const panel = document.createElement('details');
  const title = document.createElement('summary');
  const list = document.createElement('dl');
  title.textContent = label;
  fillFields(list, entries);
  panel.append(title, list);
  container.append(panel);
}

function addReportPanel(container, label, items, observed, heading) {
  const panel = document.createElement('details');
  panel.className = observed ? 'observed' : 'pending';
  const title = document.createElement('summary');
  const body = document.createElement('div');
  body.className = 'panel-body';
  title.textContent = label;
  if (heading) {
    const caption = document.createElement('strong');
    caption.textContent = heading;
    body.append(caption);
  }
  const list = document.createElement('ul');
  for (const message of items) {
    const item = document.createElement('li');
    item.textContent = message;
    list.append(item);
  }
  body.append(list);
  panel.append(title, body);
  container.append(panel);
}

function render(root, info, name) {
  const data = child(info, 'DadosDiploma');
  const register = child(info, 'DadosRegistro');
  const book = child(register, 'LivroRegistro');
  const person = child(data, 'Diplomado');
  const course = child(data, 'DadosCurso');
  const issuer = child(data, 'IesEmissora');
  const registrar = child(register, 'IesRegistradora');
  const summary = [
    ['Diplomado', value(person, 'Nome')],
    ['IES emissora', value(issuer, 'Nome')],
    ['Curso', value(course, 'NomeCurso')],
    ['Colação de grau', date(value(book, 'DataColacaoGrau') ?? value(data, 'DataColacaoGrau'))],
    ['Conclusão', date(value(data, 'DataConclusao'))],
    ['Versão declarada no XML', info.getAttribute('versao')]
  ];
  const signatures = [['Diploma', root], ['DadosDiploma', data], ['DadosRegistro', register]]
    .map(([name, element]) => [name, String(signatureCount(element))]);
  byId('report-file').textContent = name;
  const overview = byId('document-summary');
  overview.replaceChildren();
  summary.slice(0, 5).forEach(([label, text], index) => {
    const row = document.createElement('div');
    if (index >= 3) {
      const term = document.createElement('dt');
      term.textContent = label + ': ';
      row.append(term);
    }
    const description = document.createElement('dd');
    description.textContent = text || 'Não informado';
    row.append(description);
    overview.append(row);
  });
  byId('report-version').textContent = 'Versão do XML: ' + (summary[5][1] || 'Não informada');
  const panels = byId('report-details');
  panels.replaceChildren();
  const signatureItems = signatures.filter(([, count]) => Number(count) > 0)
    .map(([section]) => 'Assinatura encontrada em ' + section);
  addReportPanel(panels, 'Estrutura do Diploma Digital',
    ['XML bem-formado', 'Conformidade com o XSD: consulte o verificador oficial do MEC.'], true);
  addReportPanel(panels, 'Tipos de Assinaturas Digitais',
    signatureItems.length ? signatureItems : ['Nenhuma assinatura encontrada nas seções do XML.'],
    signatureItems.length > 0, 'Itens encontrados no XML');
  for (const label of ['Conformidade das Assinaturas Digitais', 'Integridade do Arquivo do Diploma Digital', 'Código de Validação']) {
    addReportPanel(panels, label, ['Consulte o verificador oficial do MEC.'], false);
  }
  viewer.replaceChildren();
  addPanel(viewer, 'Dados do Diploma', [...summary, ['Modalidade', value(course, 'Modalidade')], ['Grau', value(course, 'GrauConferido')]]);
  addPanel(viewer, 'Dados Registro', [['IES registradora', value(registrar, 'Nome')], ['Código e-MEC', value(registrar, 'CodigoMEC')], ['Data de registro', date(value(book, 'DataRegistro'))]]);
  addPanel(viewer, 'Assinaturas', signatures);
  viewer.firstElementChild.open = true;
  viewer.hidden = true;
  preview.setAttribute('aria-expanded', 'false');
  form.hidden = true;
  report.hidden = false;
  report.querySelector('h2').focus();
}

async function verify() {
  const file = input.files[0];
  if (!file || check.disabled || choose.disabled) return;
  choose.disabled = true;
  check.disabled = true;
  form.classList.add('is-scanning');
  result.textContent = 'Escaneando o arquivo XML…';
  try {
    const [contents] = await Promise.allSettled([
      file.text(),
      new Promise((resolve) => setTimeout(resolve, 1500))
    ]);
    if (contents.status === 'rejected') throw contents.reason;
    const xml = new DOMParser().parseFromString(contents.value, 'application/xml');
    if (xml.getElementsByTagNameNS('http://www.mozilla.org/newlayout/xml/parsererror.xml', 'parsererror').length) {
      result.textContent = 'O arquivo contém um erro de sintaxe XML.';
      return;
    }
    const root = xml.documentElement;
    const info = child(root, 'infDiploma');
    if (root.localName !== 'Diploma' || !info) {
      result.textContent = 'O XML não contém a estrutura esperada de um Diploma Digital.';
      return;
    }
    result.textContent = '';
    render(root, info, file.name);
  } catch {
    result.textContent = 'Não foi possível ler o arquivo.';
  } finally {
    form.classList.remove('is-scanning');
    choose.disabled = false;
    check.disabled = false;
  }
}

choose.addEventListener('click', () => input.click());
input.addEventListener('change', () => {
  const file = input.files[0];
  const supported = Boolean(file && /\.xml$/i.test(file.name));
  byId('filename').textContent = file?.name ?? '';
  check.disabled = !supported;
  result.textContent = file && !supported ? 'Selecione um arquivo com a extensão .xml.' : '';
});
check.addEventListener('click', verify);
preview.addEventListener('click', () => {
  viewer.hidden = !viewer.hidden;
  preview.setAttribute('aria-expanded', String(!viewer.hidden));
});
byId('reset').addEventListener('click', () => {
  input.value = '';
  byId('filename').textContent = '';
  byId('report-file').textContent = '';
  for (const id of ['document-summary', 'report-details', 'document-viewer']) byId(id).replaceChildren();
  result.textContent = '';
  check.disabled = true;
  report.hidden = true;
  form.hidden = false;
  choose.focus();
});

byId('save-report').addEventListener('click', () => window.print());

const governmentMenu = document.querySelector('.government-menu');
const governmentNav = governmentMenu.closest('nav');
governmentMenu.addEventListener('click', () => {
  governmentMenu.setAttribute('aria-expanded', String(governmentMenu.getAttribute('aria-expanded') !== 'true'));
});
document.addEventListener('click', (event) => {
  if (!governmentNav.contains(event.target)) governmentMenu.setAttribute('aria-expanded', 'false');
});
governmentNav.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || governmentMenu.getAttribute('aria-expanded') !== 'true') return;
  governmentMenu.setAttribute('aria-expanded', 'false');
  governmentMenu.focus();
});
