import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteMaterial, listMaterials } from '../api/materials';

const MATERIALS_KEY = ['materials'] as const;

export const useMaterials = () => useQuery({ queryKey: MATERIALS_KEY, queryFn: ({ signal }) => listMaterials(signal) });

export function useRefreshMaterials() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: MATERIALS_KEY });
}

export function useDeleteMaterial() {
  const refresh = useRefreshMaterials();
  return useMutation({ mutationFn: (id: string) => deleteMaterial(id), onSuccess: refresh });
}
