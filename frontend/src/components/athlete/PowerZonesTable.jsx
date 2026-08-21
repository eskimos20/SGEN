const PowerZonesTable = ({ editForm, setEditForm }) => {
  const powerZoneNames = ['Active Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2 Max', 'Anaerobic', 'Neuromuscular'];
  const ftp = parseInt(editForm.sportFtp) || 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="block text-sm font-medium text-gray-700">Power Zones</label>
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 w-10"></th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500">Zone</th>
              <th className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 w-20">%</th>
              <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-500">Range</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {editForm.sportPowerZones.map((zone, index) => {
              const prevZone = editForm.sportPowerZones[index - 1];
              const isZ7 = zone >= 999;
              
              let rangeDisplay;
              const currentWatts = Math.round(ftp * zone / 100);
              
              if (isZ7) {
                const prevZoneValue = editForm.sportPowerZones[index - 1] || 150;
                const z7WattsStart = Math.round(ftp * prevZoneValue / 100) + 1;
                rangeDisplay = `${z7WattsStart}w+`;
              } else if (index === 0) {
                rangeDisplay = `1-${currentWatts}w`;
              } else {
                const prevWatts = Math.round(ftp * prevZone / 100);
                const rangeStart = prevWatts + 1;
                rangeDisplay = `${rangeStart}-${currentWatts}w`;
              }
              
              return (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-2 py-1.5 text-gray-500 font-medium">Z{index + 1}</td>
                  <td className="px-2 py-1.5 text-gray-700">{powerZoneNames[index] || `Zone ${index + 1}`}</td>
                  <td className="px-2 py-1.5">
                    {isZ7 ? (
                      <span></span>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        max="999"
                        value={zone}
                        onChange={(e) => {
                          const newZones = [...editForm.sportPowerZones];
                          newZones[index] = parseInt(e.target.value) || 0;
                          setEditForm(prev => ({ ...prev, sportPowerZones: newZones }));
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

export default PowerZonesTable;
