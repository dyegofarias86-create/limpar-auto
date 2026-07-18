import { useEffect, useState, useRef } from 'react';
import { api } from '../contexts/AuthContext';
import { Upload as UploadIcon, FileSpreadsheet, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

export default function Upload() {
  const [history, setHistory] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  async function loadHistory() {
    try {
      const r = await api.get('/upload/history');
      setHistory(r.data);
    } catch {}
  }
  useEffect(() => { loadHistory(); }, []);

  async function handleFile(file) {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      alert('Formato inválido. Use .xlsx, .xls ou .csv');
      return;
    }
    setUploading(true);
    setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult({ success: true, data: r.data.result });
    } catch (err) {
      setResult({ success: false, error: err.response?.data?.error || 'Erro ao processar' });
    } finally {
      setUploading(false);
      loadHistory();
    }
  }

  const statusIcon = {
    completed: <CheckCircle size={16} className="text-green-500" />,
    failed: <XCircle size={16} className="text-red-500" />,
    processing: <Clock size={16} className="text-yellow-500 animate-spin" />,
    pending: <Clock size={16} className="text-gray-400" />,
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upload de Planilha</h1>
        <p className="text-gray-500 text-sm">Importe dados de faturamento, provisão e gastos a partir de uma planilha Excel</p>
      </div>

      {/* Drop zone */}
      <div
        className={`card p-10 text-center border-2 border-dashed transition-all cursor-pointer
          ${dragOver ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'}
        `}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => handleFile(e.target.files[0])} />
        {uploading ? (
          <div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-600 font-medium">Processando planilha...</p>
          </div>
        ) : (
          <div>
            <FileSpreadsheet size={48} className="mx-auto mb-3 text-primary-400" />
            <p className="text-gray-700 font-semibold mb-1">Arraste a planilha aqui ou clique para selecionar</p>
            <p className="text-sm text-gray-400">Suporte: .xlsx, .xls, .csv</p>
          </div>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className={`card p-5 border-l-4 ${result.success ? 'border-green-500' : 'border-red-500'}`}>
          <div className="flex items-center gap-2 mb-2">
            {result.success ? <CheckCircle size={18} className="text-green-500" /> : <XCircle size={18} className="text-red-500" />}
            <span className="font-semibold">{result.success ? 'Upload realizado com sucesso!' : 'Erro no upload'}</span>
          </div>
          {result.success && result.data && (
            <div className="text-sm text-gray-600 space-y-1">
              <p>Abas processadas: <strong>{result.data.sheets?.join(', ')}</strong></p>
              <p>Registros importados: <strong className="text-green-600">{result.data.success}</strong></p>
              {result.data.errors?.length > 0 && (
                <div>
                  <p className="text-amber-600">Avisos ({result.data.errors.length}):</p>
                  <ul className="list-disc list-inside text-xs text-amber-600 mt-1">
                    {result.data.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          {!result.success && <p className="text-sm text-red-600">{result.error}</p>}
        </div>
      )}

      {/* Template info */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle size={16} className="text-amber-500" />
          <h3 className="font-semibold text-gray-800">Estrutura esperada da planilha</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { sheet: 'PROVISÃO', desc: 'Dados de provisão por loja, TMO e valores' },
            { sheet: 'FATURAMENTO', desc: 'Faturamento por produto e loja' },
            { sheet: 'GASTOS REP', desc: 'Gastos do representante por semana' },
            { sheet: 'GASTOS VEND', desc: 'Gastos do vendedor' },
            { sheet: 'REEMBOLSO', desc: 'Solicitações de reembolso' },
            { sheet: 'VB MKT', desc: 'Controle de verba de marketing' },
          ].map(s => (
            <div key={s.sheet} className="flex gap-2 text-sm">
              <span className="badge-teal flex-shrink-0">{s.sheet}</span>
              <span className="text-gray-600">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Histórico de Uploads</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="table-header">Arquivo</th>
                <th className="table-header">Enviado por</th>
                <th className="table-header text-center">Status</th>
                <th className="table-header text-right">Sucesso</th>
                <th className="table-header text-right">Erros</th>
                <th className="table-header">Data</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} className="border-b border-gray-50">
                  <td className="table-cell font-medium text-gray-700">{h.filename}</td>
                  <td className="table-cell text-gray-500">{h.uploader}</td>
                  <td className="table-cell text-center">{statusIcon[h.status] || statusIcon.pending}</td>
                  <td className="table-cell text-right text-green-600">{h.records_success}</td>
                  <td className="table-cell text-right text-red-500">{h.records_error}</td>
                  <td className="table-cell text-gray-400 text-xs">{new Date(h.created_at).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
