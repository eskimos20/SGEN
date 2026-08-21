const BasicProfileFields = ({ editForm, setEditForm }) => {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
        <input
          type="number"
          value={editForm.weight}
          step="1"
          min="0"
          onChange={(e) => setEditForm(prev => ({ ...prev, weight: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Enter weight"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Height (cm)</label>
        <input
          key={`height-${editForm.height}`}
          type="number"
          value={editForm.height ? parseFloat(editForm.height.toString().replace(',', '.')) : ''}
          step="0.01"
          onChange={(e) => setEditForm(prev => ({ ...prev, height: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Enter height"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Resting HR</label>
        <input
          type="number"
          value={editForm.restingHr}
          onChange={(e) => setEditForm(prev => ({ ...prev, restingHr: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Enter resting heart rate"
        />
      </div>
    </>
  );
};

export default BasicProfileFields;
