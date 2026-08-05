import { formatPaceFromVelocity, parsePaceToVelocity } from '../../utils/zoneUtils';

const PaceZonesTable = ({ editForm, setEditForm }) => {
  const paceZoneNames = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2 Max', 'Anaerobic', 'Neuromuscular'];
  const thresholdVelocity = parsePaceToVelocity(editForm.sportThresholdPace, editForm.sportPaceUnits);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="block text-sm font-medium text-gray-700">Pace Zones</label>
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
            {editForm.sportPaceZones.map((zone, index) => {
              const prevZone = editForm.sportPaceZones[index - 1] || 0;
              const isLastZone = zone >= 999;

              const currentPace = thresholdVelocity ? formatPaceFromVelocity(thresholdVelocity * zone / 100, editForm.sportPaceUnits) : null;
              const prevPace = thresholdVelocity && index > 0 ? formatPaceFromVelocity(thresholdVelocity * prevZone / 100, editForm.sportPaceUnits) : null;

              // Faster pace = lower time, so a higher zone % means a lower (faster) pace value
              let rangeDisplay = '—';
              if (thresholdVelocity) {
                if (isLastZone) {
                  rangeDisplay = `faster than ${prevPace}`;
                } else if (index === 0) {
                  rangeDisplay = `slower than ${currentPace}`;
                } else {
                  rangeDisplay = `${prevPace} - ${currentPace}`;
                }
              }

              return (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-2 py-1.5 text-gray-500 font-medium">Z{index + 1}</td>
                  <td className="px-2 py-1.5 text-gray-700">{paceZoneNames[index] || `Zone ${index + 1}`}</td>
                  <td className="px-2 py-1.5">
                    {isLastZone ? (
                      <span></span>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        max="300"
                        value={zone}
                        onChange={(e) => {
                          const newZones = [...editForm.sportPaceZones];
                          newZones[index] = parseInt(e.target.value) || 0;
                          setEditForm(prev => ({ ...prev, sportPaceZones: newZones }));
                        }}
                        className="w-16 px-2 py-1 text-center text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-gray-500 text-sm text-right whitespace-nowrap">
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

export default PaceZonesTable;
