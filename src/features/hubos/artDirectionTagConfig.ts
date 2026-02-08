import type { ArtDirectionTag } from './types';

export const ART_DIRECTION_TAG_CONFIG: Record<
  ArtDirectionTag,
  { label: string; color: string; text: string }
> = {
  ARTE_PRONTA_EDICAO: {
    label: 'Arte Pronta ou Edição',
    color: '#0FB2F2',
    text: 'Arte Pronta ou Edição - Lembre de dar prioridade para essa tag',
  },
  CRIACAO_ARTE: {
    label: 'Criação de Arte',
    color: '#F2B113',
    text: 'Criação de Arte - Seguir fluxo normal',
  },
  URGENTE: {
    label: 'Urgente',
    color: '#F27C13',
    text: 'Urgente - Pedidos de um dia para o outro - Prioridade Máxima',
  },
};

export const ART_DIRECTION_TAGS = Object.keys(ART_DIRECTION_TAG_CONFIG) as ArtDirectionTag[];
