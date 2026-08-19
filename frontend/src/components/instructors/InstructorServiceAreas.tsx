import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, AlertCircle } from 'lucide-react';
import { instructorsApi } from '@/api';

interface InstructorServiceAreasProps {
  instructorId: string;
}

const ZIP_FORMAT = /^\d{5}$/;

export const InstructorServiceAreas: React.FC<InstructorServiceAreasProps> = ({
  instructorId,
}) => {
  const queryClient = useQueryClient();
  const [zips, setZips] = useState<string[]>([]);
  const [zipInput, setZipInput] = useState('');
  const [inputError, setInputError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['instructor-service-areas', instructorId],
    queryFn: () => instructorsApi.getServiceAreas(instructorId),
  });

  useEffect(() => {
    if (data?.data) {
      setZips(data.data);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (nextZips: string[]) => instructorsApi.setServiceAreas(instructorId, nextZips),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructor-service-areas', instructorId] });
    },
  });

  const handleAddZip = () => {
    const trimmed = zipInput.trim();
    if (!ZIP_FORMAT.test(trimmed)) {
      setInputError('Enter a 5-digit ZIP code');
      return;
    }
    if (zips.includes(trimmed)) {
      setInputError('That ZIP code is already in the list');
      return;
    }
    setZips((prev) => [...prev, trimmed].sort());
    setZipInput('');
    setInputError('');
  };

  const handleRemoveZip = (zip: string) => {
    setZips((prev) => prev.filter((z) => z !== zip));
  };

  const handleSave = () => {
    saveMutation.mutate(zips);
  };

  if (isLoading) {
    return (
      <div className="animate-pulse bg-surface2 rounded-lg p-4">
        <div className="h-4 bg-surface3 rounded w-1/3"></div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-tx-secondary mb-3">
        ZIP codes this instructor is willing to travel to for a lesson. Leave empty to serve every ZIP code
        (the default) - the ranked slot search prefers instructors whose service area covers the pickup
        address, but never excludes an instructor with no service area configured.
      </p>

      {zips.length === 0 ? (
        <p className="text-sm text-tx-muted italic mb-3">No service area configured - serves everywhere.</p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3">
          {zips.map((zip) => (
            <span
              key={zip}
              className="inline-flex items-center gap-1 rounded-full bg-surface2 border border-edge-strong px-3 py-1 text-sm text-tx-primary"
            >
              {zip}
              <button
                type="button"
                onClick={() => handleRemoveZip(zip)}
                aria-label={`Remove ${zip}`}
                className="text-tx-muted hover:text-status-danger-text transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2">
        <div className="flex-1">
          <input
            type="text"
            value={zipInput}
            onChange={(e) => {
              setZipInput(e.target.value);
              setInputError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddZip();
              }
            }}
            placeholder="92101"
            maxLength={5}
            autoComplete="nope"
            className="w-full rounded-lg border border-edge-strong px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
          />
          {inputError && (
            <p className="mt-1 text-xs text-status-danger-text flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {inputError}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleAddZip}
          className="flex items-center gap-1 rounded-lg border border-edge-strong px-3 py-2 text-sm font-medium text-tx-secondary hover:bg-surface2 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Service Area'}
        </button>
        {saveMutation.isSuccess && (
          <span className="text-sm text-status-success-text">Saved</span>
        )}
        {saveMutation.isError && (
          <span className="text-sm text-status-danger-text">Failed to save - try again</span>
        )}
      </div>
    </div>
  );
};

export default InstructorServiceAreas;
