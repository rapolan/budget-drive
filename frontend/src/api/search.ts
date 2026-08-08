import { apiClient } from './client';
import type { PersonSearchResult, ApiResponse } from '@/types';

export const searchApi = {
  people: async (term: string) => {
    const response = await apiClient.get<ApiResponse<PersonSearchResult[]>>(
      `/search/people?q=${encodeURIComponent(term)}`
    );
    return response.data;
  },
};
