export const plans = [
  { code:'tendi_start', name:'Tendi Start', label:'Para equipes que estão começando', description:'Organize o atendimento e dê estrutura à rotina comercial.', attendants:'Até 4 atendentes', sectors:'Estrutura essencial', featured:false, features:['Até 4 atendentes','Inbox de atendimento','CRM comercial','Inteligência artificial','Histórico de conversas','Organização da operação'], cta:'Começar teste grátis', href:'/register?plan=tendi_start' },
  { code:'tendi_pro', name:'Tendi Pro', label:'Para operações em crescimento', description:'Mais capacidade para equipes, setores e rotinas financeiras.', attendants:'Até 10 atendentes', sectors:'Até 10 setores', featured:true, features:['Até 10 atendentes','Até 10 setores','Inbox e CRM comercial','Inteligência artificial','Recursos de segunda via de boleto','Estrutura para integrações adicionais'], cta:'Começar teste grátis', href:'/register?plan=tendi_pro' },
] as const;
export const comparison = [
  {feature:'Atendentes',start:'Até 4',pro:'Até 10'},
  {feature:'Setores',start:'Estrutura essencial',pro:'Até 10'},
  {feature:'Inbox de atendimento',start:'Incluído',pro:'Incluído'},
  {feature:'CRM comercial',start:'Incluído',pro:'Incluído'},
  {feature:'Inteligência artificial',start:'Incluída',pro:'Incluída'},
  {feature:'Segunda via de boleto',start:'Não incluída',pro:'Incluída'},
  {feature:'Integrações adicionais',start:'Sob contratação',pro:'Sob contratação'},
] as const;
