export const HOME = {
  emergentLink: "home-emergent-link",
};

export const AUTH = {
  loginEmail: "login-email-input",
  loginPassword: "login-password-input",
  loginSubmit: "login-submit-btn",
  loginForgot: "login-forgot-link",
  logoutBtn: "logout-btn",
  forgotEmail: "forgot-email-input",
  forgotSubmit: "forgot-submit-btn",
  resetPassword: "reset-password-input",
  resetSubmit: "reset-submit-btn",
};

export const NAV = {
  sidebar: "app-sidebar",
  mobileBottom: "mobile-bottom-nav",
  link: (id) => `nav-${id}`,
};

export const OBRAS = {
  newBtn: "obras-new-btn",
  saveBtn: "obras-save-btn",
  row: (id) => `obra-row-${id}`,
  edit: (id) => `obra-edit-${id}`,
  del: (id) => `obra-delete-${id}`,
};

export const CONCRETO = {
  newBtn: "concreto-new-btn",
  saveBtn: "concreto-save-btn",
  row: (id) => `concreto-row-${id}`,
  addCP: (id) => `concreto-addcp-${id}`,
};

export const CP = {
  batchSave: "cp-batch-save",
  row: (id) => `cp-row-${id}`,
  ruptura: (id) => `cp-ruptura-${id}`,
};

export const RUPTURA = {
  saveBtn: "ruptura-save-btn",
  cargaInput: "ruptura-carga-input",
  diametroInput: "ruptura-diametro-input",
  resultado: "ruptura-resultado",
};

export const EQUIP = {
  newBtn: "equip-new-btn",
  saveBtn: "equip-save-btn",
  row: (id) => `equip-row-${id}`,
};

export const REL = {
  gerarPdf: (id) => `relatorio-pdf-${id}`,
};
