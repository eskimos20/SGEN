const HRZonesTable = ({ editForm, setEditForm }) => {
  const hrZoneNames = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2 Max', 'Anaerobic', 'Neuromuscular'];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="block text-sm font-medium text-gray-700">Heart Rate Zones</label>
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 w-10"></th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500">Zone</th>
              <th className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 w-20">BPM</th>
              <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-500">Range</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {editForm.sportHrZones.map((zone, index) => {
              const prevZone = editForm.sportHrZones[index - 1];
              const isLastZone = index === editForm.sportHrZones.length - 1;
              
              let rangeDisplay;
              if (index === 0) {
                rangeDisplay = `1-${zone}`;
              } else if (isLastZone) {
                const rangeStart = prevZone + 1;
                rangeDisplay = `${rangeStart}+`;
              } else {
                const rangeStart = prevZone + 1;
                rangeDisplay = `${rangeStart}-${zone}`;
              }
              
              return (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-2 py-1.5 text-gray-500 font-medium">Z{index + 1}</td>
                  <td className="px-2 py-1.5 text-gray-700">{hrZoneNames[index] || `Zone ${index + 1}`}</td>
                  <td className="px-2 py-1.5">
                    {isLastZone ? (
                      <span></span>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        max="220"
                        value={zone}
                        onChange={(e) => {
                          const newZones = [...editForm.sportHrZones];
                          newZones[index] = parseInt(e.target.value) || 0;
                          setEditForm(prev => ({ ...prev, sportHrZones: newZones }));
                        }}
                        className="w-16 px-2 py-1 text-center text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-gray-500 text-sm text-right">
                    {rangeDisplay}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HRZonesTable;
