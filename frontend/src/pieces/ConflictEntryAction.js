
import React from "react";

import {
  CheckCircle
} from "lucide-react";

import Modal from "./Modal"

const ConflictEntryAction = ({ isVisible, onClose, onReplace }) => (
  <Modal isVisible={isVisible} onClose={onClose} size="md">
    <div className="p-8 text-center">
      <h3 className="text-2xl font-bold text-gray-900 mb-3">Номер уже существует</h3>
      <p className="text-gray-600 mb-8 leading-relaxed">
        Хотите удалить старый и сохранить как новый?
      </p>
      <button
        onClick={onClose}
        className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-4 px-8 rounded-xl hover:from-green-600 hover:to-green-700 transition-all font-semibold shadow-lg"
      >
        Назад
      </button>
      <button
        onClick={onReplace}
        className="w-full mt-2 bg-gradient-to-r from-red-500 to-red-600 text-white py-4 px-8 rounded-xl hover:from-red-600 hover:to-red-700 transition-all font-semibold shadow-lg"
      >
        Заменить
      </button>
    </div>
  </Modal>
);


export default ConflictEntryAction;