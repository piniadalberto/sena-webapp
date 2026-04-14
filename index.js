const express = require('express');
const { chromium } = require('playwright');

const app = express();
app.use(express.json());

const PORT = 3000;
const SOFIA_URL = 'http://senasofiaplus.edu.co/sofia-public/index.jsp';

const SEL = {
  tipoDocLogin:    '#tipoId',
  inputCedula:     '#username',
  inputPassword:   '[name="josso_password"]',
  btnLogin:        '[name="ingresar"]',
  perfilSelect:    '#tipoId',
  perfilOpcion:    'Usuario SENA',
  menuInscripcion:    'a:has-text("Inscripción")',
  menuConsultarProg:  'a:has-text("Consultar Programas de Formación")',
  menuConsultarInscr: 'a:has-text("Consultar Inscripciones a Programas")',
  tipoDocSelect:   '#seleccionTipoIdentificacion',
  numDocInput:     '#inputNumeroIdentificacion',
  btnConsultar:    '#formPrincipal\\:btnAplicar',
  tablaExiste:     '[id*="dtProgramas"]',
  mensajeNoExiste: '#messages.warn',
};

const TIPO_DOC_MAP = {
  'CC':  'CC',
  'TI':  'TI',
  'CE':  'CE',
  'PEP': 'PEP',
  'PPT': 'PPT',
  'DNI': 'DNI',
  'NCS': 'NCS',
  'PS':  'PS',
};

// Usamos selectOption por VALUE (más confiable que por label)
const usarValor = true;

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/login-test', async (req, res) => {
  const { cedula, password } = req.body;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(SOFIA_URL, { waitUntil: 'networkidle' });
    await page.selectOption(SEL.tipoDocLogin, { label: 'Cédula de Ciudadanía' });
    await page.fill(SEL.inputCedula, cedula);
    await page.fill(SEL.inputPassword, password);
    await page.click(SEL.btnLogin);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector(SEL.perfilSelect, { timeout: 10000 });
    await page.selectOption(SEL.perfilSelect, { label: SEL.perfilOpcion });
    await page.waitForLoadState('networkidle');
    const loginOk = await page.locator(SEL.menuInscripcion).count() > 0;
    await browser.close();
    res.json({ ok: loginOk });
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/verificar', async (req, res) => {
  const { cedula, password, aprendices } = req.body;
  if (!cedula || !password || !aprendices?.length) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(25000);

    await page.goto(SOFIA_URL, { waitUntil: 'networkidle' });
    await page.selectOption(SEL.tipoDocLogin, { label: 'Cédula de Ciudadanía' });
    await page.fill(SEL.inputCedula, cedula);
    await page.fill(SEL.inputPassword, password);
    await page.click(SEL.btnLogin);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector(SEL.perfilSelect, { timeout: 10000 });
    await page.selectOption(SEL.perfilSelect, { label: SEL.perfilOpcion });
    await page.waitForLoadState('networkidle');
    await page.click(SEL.menuInscripcion);
    await page.waitForLoadState('networkidle');
    await page.click(SEL.menuConsultarProg);
    await page.waitForLoadState('networkidle');
    await page.click(SEL.menuConsultarInscr);
    await page.waitForLoadState('networkidle');

    const resultados = [];
    for (const aprendiz of aprendices) {
      let estado = 'NO EXISTE';
      try {
        const valorTipo = TIPO_DOC_MAP[aprendiz.tipo] || 'CC';
        await page.selectOption(SEL.tipoDocSelect, { value: valorTipo });
        await page.fill(SEL.numDocInput, '');
        await page.fill(SEL.numDocInput, String(aprendiz.doc));
        await page.click(SEL.btnConsultar);
        await page.waitForLoadState('networkidle');
        const tieneTabla    = await page.locator(SEL.tablaExiste).count();
        const tieneNoExiste = await page.locator(SEL.mensajeNoExiste).count();
        if (tieneTabla > 0) estado = 'MATRICULADO';
        else if (tieneNoExiste > 0) estado = 'NO EXISTE';
      } catch (err) {
        console.error(`Error ${aprendiz.doc}:`, err.message);
        estado = 'ERROR';
      }
      resultados.push({ tipo: aprendiz.tipo, doc: aprendiz.doc, nombre: aprendiz.nombre, estado });
      console.log(`${aprendiz.nombre} → ${estado}`);
      await new Promise(r => setTimeout(r, 1000));
    }

    await browser.close();
    res.json({ ok: true, resultados });
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Playwright Service corriendo en puerto ${PORT}`));
