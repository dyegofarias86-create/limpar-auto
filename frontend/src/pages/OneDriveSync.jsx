import { useEffect, useState, useRef } from 'react';
import { api } from '../contexts/AuthContext';
import {
  Cloud, Upload, Link, RefreshCw, CheckCircle, XCircle,
  AlertCircle, TrendingUp, Users, FileSpreadsheet, Info, Table2
} from 'lucide-react';

const BRL = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const TARGET_REPS = ['EDNILSON', 'DELIO', 'BASE MG', 'WALLACE', 'DANIELA', 'JACKSON', 'OTÁVIO', 'ARTHUR'];

export default function OneDriveSync() {
  const [mode, setMode] = useState('upload'); // 'upload' | 'url'
  const [period, setPeriod] = useState({ month: 6, year: 2026 }); // Começa em junho

  // Planilha Faturamento mensal
  const [fatFile, setFatFile]     = useState(null);
  const [fatPeriod, setFatPeriod] = useState({ month: 6, year: 2026 });
  const [fatLoading, setFatLoading] = useState(false);
  const [fatResult, setFatResult]   = useState(null);
  const fatFileRef = useRef();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState([]);
  const [history, setHistory] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  async function loadPreview() {
    const [prev, hist] = await Promise.all([
      api.get(`/onedrive/preview?month=${period.month}&year=${period.year}`),
      api.get('/onedrive/status')
    ]);
    setPreview(prev.data);
    setHistory(hist.data);
  }
  useEffect(() => { loadPreview(); }, [period]);

  async function handleFile(file) {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) return alert('Formato inválido. Use .xlsx ou .xls');
    setLoading(true); setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('month', period.month);
    fd.append('year', period.year);
    try {
      const r = await api.post('/onedrive/sync-upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult({ success: true, data: r.data });
      loadPreview();
    } catch (e) {
      setResult({ success: false, error: e.response?.data?.error || 'Erro ao processar' });
    } finally { setLoading(false); }
  }

  async function handleUrl() {
    if (!url.trim()) return;
    setLoading(true); setResult(null);
    try {
      const r = await api.post('/onedrive/sync-url', { url: url.trim(), month: period.month, year: period.year });
      setResult({ success: true, data: r.data });
      loadPreview();
    } catch (e) {
      setResult({ success: false, error: e.response?.data?.error || 'Erro ao baixar arquivo' });
    } finally { setLoading(false); }
  }

  const totalTMO = preview.reduce((a, b) => a + (b.tmo || 0), 0);
  const totalRevenue = preview.reduce((a, b) => a + (b.revenue || 0), 0);

  async function handleFatUpload(file) {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) return alert('Formato inválido. Use .xlsx ou .xls');
    setFatFile(file);
    setFatLoading(true); setFatResult(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('month', fatPeriod.month);
    fd.append('year', fatPeriod.year);
    try {
      const r = await api.post('/faturamento-upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFatResult({ success: true, data: r.data });
      loadPreview();
    } catch (e) {
      setFatResult({ success: false, error: e.response?.data?.error || 'Erro ao processar' });
    } finally { setFatLoading(false); }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Cloud size={24} className="text-primary-500" />
          Sincronizar Faturamento (OneDrive)
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Importa R$ e TMO do arquivo <strong>FATURAMENTO_GERAL_CONSOLIDADO_LIMPAR.XLSX</strong> para os representantes ativos.
        </p>
      </div>

      {/* Reps alvo */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={15} className="text-teal-600" />
          <span className="font-semibold text-sm text-gray-700">Representantes monitorados</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {TARGET_REPS.map(r => (
            <span key={r} className="badge-teal text-sm px-3 py-1">{r}</span>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Coluna identificadora: <code className="bg-gray-100 px-1 rounded">RESPONSÁVEL</code> — se o representante tiver vendedor vinculado, o faturamento do vendedor também é somado ao total do representante.
        </p>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-gray-600">Período de referência:</span>
        <select className="input w-auto" value={period.month} onChange={e => setPeriod(v => ({ ...v, month: +e.target.value }))}>
          {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select className="input w-auto" value={period.year} onChange={e => setPeriod(v => ({ ...v, year: +e.target.value }))}>
          {[2025,2026,2027].map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      {/* Mode selector */}
      <div className="card overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { id: 'upload', label: 'Upload do Arquivo', icon: Upload },
            { id: 'url',    label: 'Link de Download',  icon: Link },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                mode === tab.id
                  ? 'bg-primary-50 text-primary-600 border-b-2 border-primary-500'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <tab.icon size={15} /> {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {mode === 'upload' ? (
            <>
              {/* How to download */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5 text-sm text-blue-800 flex gap-3">
                <Info size={16} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">Como baixar o arquivo do OneDrive:</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
                    <li>Acesse o OneDrive: <strong>BI LIMPAR → REPORT - FATURAMENTO GERAL</strong></li>
                    <li>Clique com botão direito em <strong>FATURAMENTO_GERAL_CONSOLIDADO_LIMPAR.XLSX</strong></li>
                    <li>Selecione <strong>"Baixar"</strong></li>
                    <li>Arraste ou selecione o arquivo abaixo</li>
                  </ol>
                </div>
              </div>

              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                  dragOver ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                }`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
              >
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files[0])} />
                {loading ? (
                  <div>
                    <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">Processando arquivo...</p>
                  </div>
                ) : (
                  <div>
                    <FileSpreadsheet size={48} className="mx-auto mb-3 text-primary-400" />
                    <p className="font-semibold text-gray-700 mb-1">Arraste o arquivo aqui ou clique para selecionar</p>
                    <p className="text-xs text-gray-400">FATURAMENTO_GERAL_CONSOLIDADO_LIMPAR.XLSX</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5 text-sm text-blue-800 flex gap-3">
                <Info size={16} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">Como obter o link de download direto:</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
                    <li>No OneDrive, clique com botão direito no arquivo XLSX</li>
                    <li>Selecione <strong>"Detalhes"</strong> → <strong>"Caminho"</strong> → Copie</li>
                    <li>Ou compartilhe o arquivo com <strong>"Qualquer pessoa com o link"</strong> e cole abaixo</li>
                    <li>O link deve ser um link de <strong>download direto</strong> (não de visualização)</li>
                  </ol>
                </div>
              </div>
              <div className="space-y-3">
                <label className="label">URL de download direto do arquivo</label>
                <input
                  className="input"
                  placeholder="https://... (link de download do OneDrive)"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                />
                <button
                  onClick={handleUrl}
                  disabled={loading || !url.trim()}
                  className="btn-primary"
                >
                  {loading ? (
                    <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Baixando...</>
                  ) : (
                    <><RefreshCw size={15} /> Sincronizar Agora</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className={`card p-5 border-l-4 ${result.success ? 'border-green-500' : 'border-red-500'}`}>
          <div className="flex items-center gap-2 mb-3">
            {result.success ? <CheckCircle size={18} className="text-green-500" /> : <XCircle size={18} className="text-red-500" />}
            <span className="font-semibold">{result.success ? 'Sincronização concluída!' : 'Erro na sincronização'}</span>
          </div>
          {result.success && result.data?.result && (
            <div className="space-y-2 text-sm">
              {result.data.result.saved.map(s => (
                <div key={s.rep} className="flex items-center gap-3 bg-green-50 rounded-lg px-3 py-2">
                  <CheckCircle size={13} className="text-green-500" />
                  <span className="font-medium text-green-800">{s.rep}</span>
                  <span className="text-green-600">— {Number(s.tmo).toLocaleString('pt-BR')} TMO | {BRL(s.revenue)}</span>
                </div>
              ))}
              {result.data.result.errors.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  <AlertCircle size={13} /> {e}
                </div>
              ))}
            </div>
          )}
          {!result.success && <p className="text-sm text-red-600">{result.error}</p>}
        </div>
      )}

      {/* Current data preview */}
      {preview.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">
              Faturamento Importado — {MONTHS[period.month - 1]}/{period.year}
            </h3>
            <button onClick={loadPreview} className="text-gray-400 hover:text-primary-500">
              <RefreshCw size={15} />
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="table-header">Representante</th>
                <th className="table-header text-right">TMO</th>
                <th className="table-header text-right">Faturamento (R$)</th>
                <th className="table-header text-right">Verba MKT (0,25/TMO)</th>
              </tr>
            </thead>
            <tbody>
              {preview.map(row => (
                <tr key={row.rep_name} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="table-cell font-medium text-gray-800">{row.rep_name}</td>
                  <td className="table-cell text-right">{Number(row.tmo).toLocaleString('pt-BR')}</td>
                  <td className="table-cell text-right font-semibold text-primary-600">{BRL(row.revenue)}</td>
                  <td className="table-cell text-right text-teal-600">{BRL(row.tmo * 0.25)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                <td className="table-cell text-gray-700">TOTAL</td>
                <td className="table-cell text-right">{Number(totalTMO).toLocaleString('pt-BR')}</td>
                <td className="table-cell text-right text-primary-600">{BRL(totalRevenue)}</td>
                <td className="table-cell text-right text-teal-600">{BRL(totalTMO * 0.25)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {preview.length === 0 && (
        <div className="card p-8 text-center text-gray-400">
          <Cloud size={40} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum dado importado para {MONTHS[period.month-1]}/{period.year}</p>
          <p className="text-xs mt-1">Use o upload acima para importar os dados do OneDrive</p>
        </div>
      )}

      {/* Sync history */}
      {history.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 text-sm">Histórico de Syncs</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="table-header">Arquivo</th>
                <th className="table-header">Por</th>
                <th className="table-header text-center">Status</th>
                <th className="table-header">Data</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} className="border-b border-gray-50">
                  <td className="table-cell">{h.filename}</td>
                  <td className="table-cell text-gray-500">{h.uploader}</td>
                  <td className="table-cell text-center">
                    {h.status === 'completed'
                      ? <CheckCircle size={15} className="text-green-500 mx-auto" />
                      : <XCircle size={15} className="text-red-500 mx-auto" />}
                  </td>
                  <td className="table-cell text-gray-400 text-xs">{new Date(h.created_at).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== NOVA SEÇÃO: Upload Planilha Faturamento Mensal ===== */}
      <div className="card overflow-hidden border-2 border-teal-200">
        <div className="bg-teal-50 px-5 py-3 flex items-center gap-2 border-b border-teal-100">
          <Table2 size={18} className="text-teal-600" />
          <span className="font-semibold text-teal-800">Upload Planilha Faturamento Mensal</span>
          <span className="ml-auto text-xs text-teal-600 bg-teal-100 px-2 py-0.5 rounded-full">Novo formato</span>
        </div>

        <div className="p-5">
          <p className="text-sm text-gray-600 mb-4">
            Faça upload da sua planilha mensal de faturamento (ex: <strong>faturamento-2026-06.xlsx</strong>).
            O sistema importa automaticamente TMO e valor apenas dos seus representantes.
          </p>

          {/* Period */}
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <span className="text-sm font-medium text-gray-600">Mês/Ano da planilha:</span>
            <select className="input w-auto" value={fatPeriod.month} onChange={e => setFatPeriod(v => ({ ...v, month: +e.target.value }))}>
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
            <select className="input w-auto" value={fatPeriod.year} onChange={e => setFatPeriod(v => ({ ...v, year: +e.target.value }))}>
              {[2025,2026,2027].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFatUpload(e.dataTransfer.files[0]); }}
            onClick={() => fatFileRef.current?.click()}
            className="border-2 border-dashed border-teal-300 rounded-xl p-8 text-center cursor-pointer hover:border-teal-500 hover:bg-teal-50 transition-colors"
          >
            <input ref={fatFileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => handleFatUpload(e.target.files[0])} />
            {fatLoading ? (
              <div className="flex flex-col items-center gap-2 text-teal-600">
                <RefreshCw size={24} className="animate-spin" />
                <span className="text-sm">Processando...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <FileSpreadsheet size={32} className="text-teal-400" />
                <p className="font-medium text-gray-700">Clique ou arraste o arquivo aqui</p>
                <p className="text-xs text-gray-400">faturamento-2026-{String(fatPeriod.month).padStart(2,'0')}.xlsx</p>
              </div>
            )}
          </div>

          {/* Result */}
          {fatResult && (
            <div className={`mt-4 rounded-xl p-4 ${fatResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              {fatResult.success ? (
                <div className="flex items-start gap-3">
                  <CheckCircle size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-green-800">Importado com sucesso!</p>
                    <p className="text-sm text-green-700 mt-1">
                      <strong>{fatResult.data.savedRecords}</strong> registros salvos &nbsp;·&nbsp;
                      {fatResult.data.skippedRecords} ignorados &nbsp;·&nbsp;
                      {fatResult.data.deletedPrevious} registros anteriores substituídos
                    </p>
                    {fatResult.data.errors?.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-green-600 cursor-pointer">Ver erros ({fatResult.data.errors.length})</summary>
                        <ul className="text-xs text-red-600 mt-1">{fatResult.data.errors.map((e,i) => <li key={i}>{e}</li>)}</ul>
                      </details>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle size={16} /> <span className="text-sm">{fatResult.error}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
