import Modal from './Modal';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({ open, onClose, onConfirm, title = '¿Estás seguro?', message, loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="modal-body">
        <div className="flex gap-4">
          <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <p className="text-sm text-gray-600 pt-2">{message || 'Esta acción no se puede deshacer.'}</p>
        </div>
      </div>
      <div className="modal-footer">
        <button onClick={onClose} className="btn-secondary" disabled={loading}>Cancelar</button>
        <button onClick={onConfirm} className="btn-danger" disabled={loading}>
          {loading ? 'Eliminando...' : 'Sí, eliminar'}
        </button>
      </div>
    </Modal>
  );
}
