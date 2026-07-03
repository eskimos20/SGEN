import { useState, useEffect } from 'react';
import { X, Download, Loader2, Check } from 'lucide-react';
import api from '../../api/axios';
import jsPDF from 'jspdf';
import { isCapacitor } from '../../config/api.config';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

const ExportGearModal = ({ isOpen, onClose, gear }) => {
  useLockBodyScroll(isOpen);
  const [selectedGearIds, setSelectedGearIds] = useState(new Set());
  const [maintenanceData, setMaintenanceData] = useState({});
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedGearIds(new Set());
      setMaintenanceData({});
      setError('');
    }
  }, [isOpen]);

  const handleGearToggle = (gearId) => {
    const newSelected = new Set(selectedGearIds);
    if (newSelected.has(gearId)) {
      newSelected.delete(gearId);
    } else {
      newSelected.add(gearId);
    }
    setSelectedGearIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedGearIds.size === gear.length) {
      setSelectedGearIds(new Set());
    } else {
      setSelectedGearIds(new Set(gear.map(g => g.id)));
    }
  };

  const fetchMaintenanceForSelected = async () => {
    setLoading(true);
    setError('');
    const data = {};

    try {
      for (const gearId of selectedGearIds) {
        try {
          const response = await api.get(`/gear-maintenance/gear/${gearId}`);
          data[gearId] = response.data;
        } catch (err) {
          console.error(`Failed to fetch maintenance for gear ${gearId}:`, err);
          data[gearId] = [];
        }
      }
      setMaintenanceData(data);
    } catch (err) {
      setError('Failed to load maintenance data');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (selectedGearIds.size === 0) {
      setError('Please select at least one gear item');
      return;
    }

    setExporting(true);
    setError('');

    try {
      // Fetch maintenance data directly without using state
      const data = {};
      for (const gearId of selectedGearIds) {
        try {
          const response = await api.get(`/gear-maintenance/gear/${gearId}`);
          data[gearId] = response.data;
        } catch (err) {
          console.error(`Failed to fetch maintenance for gear ${gearId}:`, err);
          data[gearId] = [];
        }
      }


      // Generate PDF
      const pdf = new jsPDF();
      let yPos = 20;
      const pageHeight = pdf.internal.pageSize.height;
      const margin = 20;
      const contentWidth = pdf.internal.pageSize.width - (margin * 2);

      // Title
      pdf.setFontSize(20);
      pdf.setTextColor(0, 0, 0);
      pdf.text('Gear Maintenance History', margin, yPos);
      yPos += 15;

      // Date
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, margin, yPos);
      yPos += 15;

      for (const gearId of selectedGearIds) {
        const gearItem = gear.find(g => g.id === gearId);
        const maintenance = data[gearId] || [];

        // Check if we need a new page
        if (yPos > pageHeight - 40) {
          pdf.addPage();
          yPos = 20;
        }

        // Gear name
        pdf.setFontSize(14);
        pdf.setTextColor(0, 0, 0);
        pdf.text(gearItem?.name || 'Unknown Gear', margin, yPos);
        yPos += 10;

        if (maintenance.length === 0) {
          pdf.setFontSize(10);
          pdf.setTextColor(150, 150, 150);
          pdf.text('No maintenance records', margin, yPos);
          yPos += 15;
        } else {
          // Maintenance records
          pdf.setFontSize(10);
          pdf.setTextColor(0, 0, 0);

          for (const record of maintenance) {
            if (yPos > pageHeight - 30) {
              pdf.addPage();
              yPos = 20;
            }

            // Service type and date
            pdf.setFont(undefined, 'bold');
            pdf.text(`${record.serviceType} - ${record.serviceDate}`, margin, yPos);
            yPos += 6;

            // Description
            if (record.description) {
              pdf.setFont(undefined, 'normal');
              const descriptionLines = pdf.splitTextToSize(record.description, contentWidth);
              pdf.text(descriptionLines, margin + 5, yPos);
              yPos += descriptionLines.length * 5;
            }

            // Details
            pdf.setFont(undefined, 'normal');
            const details = [];
            if (record.distanceAtService) {
              details.push(`Distance: ${Math.round(record.distanceAtService / 1000)} km`);
            }
            if (record.cost) {
              details.push(`Cost: ${record.cost.toFixed(2)} SEK`);
            }
            if (record.performedBy) {
              details.push(`By: ${record.performedBy}`);
            }

            if (details.length > 0) {
              pdf.text(details.join(' | '), margin + 5, yPos);
              yPos += 6;
            }

            yPos += 8;
          }
        }

        yPos += 10;
      }

      // Save PDF
      const fileName = `gear-maintenance-${new Date().toISOString().split('T')[0]}.pdf`;

      if (isCapacitor) {
        // On Android, pdf.save() and blob/data URI approaches are blocked by WebView.
        // Write the PDF to the cache directory and open the share sheet.
        const base64 = pdf.output('datauristring').split(',')[1];
        const savedFile = await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Cache
        });
        await Share.share({
          title: 'Gear Maintenance PDF',
          url: savedFile.uri,
          dialogTitle: 'Save or share PDF'
        });
      } else {
        pdf.save(fileName);
      }

      onClose();
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError('Failed to generate PDF');
    } finally {
      setExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col rounded-t-2xl sm:rounded-t-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10 sm:rounded-t-xl">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Export Gear Maintenance</h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">Select gears to export maintenance history</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            title="Close"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">
              {error}
            </div>
          )}

          {gear.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No gear available to export</p>
            </div>
          ) : (
            <>
              {/* Select All */}
              <label className="flex items-center gap-3 cursor-pointer mb-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div
                  onClick={handleSelectAll}
                  className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
                    selectedGearIds.size === gear.length ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                  }`}
                >
                  {selectedGearIds.size === gear.length && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
                <span className="font-medium text-gray-900">Select All ({selectedGearIds.size}/{gear.length})</span>
              </label>

              {/* Gear List */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {gear.map((gearItem) => (
                  <label
                    key={gearItem.id}
                    className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div
                      onClick={() => handleGearToggle(gearItem.id)}
                      className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
                        selectedGearIds.has(gearItem.id) ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                      }`}
                    >
                      {selectedGearIds.has(gearItem.id) && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{gearItem.name}</p>
                      {gearItem.distance && (
                        <p className="text-sm text-gray-500">{Math.round(gearItem.distance / 1000)} km</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 sm:gap-3 p-4 sm:p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-3 sm:px-4 py-2 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-colors text-sm sm:text-base"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || selectedGearIds.size === 0}
            className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Export PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportGearModal;
