import { StudioBackground } from '../types';
import newsroomStudioImg from '../assets/images/newsroom_studio_backdrop_1794323879260.jpg';
import breakingNewsImg from '../assets/images/breaking_news_studio_1794323879177.jpg';
import globalAffairsImg from '../assets/images/global_affairs_studio_1794323880150.jpg';
import financialTechImg from '../assets/images/financial_tech_studio_1794323879883.jpg';

export const STUDIO_IMAGE_ASSETS = {
  newsroom: newsroomStudioImg,
  breaking: breakingNewsImg,
  global: globalAffairsImg,
  financial: financialTechImg,
};

export const STUDIO_BACKGROUNDS: StudioBackground[] = [
  {
    id: 'newsroom-blue',
    name: 'TG World Studio (Blu LED)',
    category: 'preset',
    url: newsroomStudioImg,
    description: 'Set televisivo moderno con schermi curvi blu, mappe vettoriali e bancone in cristallo.',
  },
  {
    id: 'breaking-red',
    name: 'Ultim’Ora Breaking News (Rosso)',
    category: 'preset',
    url: breakingNewsImg,
    description: 'Atmosfera ad alto impatto per edizioni straordinarie con pannelli LED rossi e monitor live.',
  },
  {
    id: 'global-affairs',
    name: 'Esteri & Skyline Metropolitano',
    category: 'preset',
    url: globalAffairsImg,
    description: 'Elegante studio internazionale con grandi vetrate su skyline notturno e globi luminosi.',
  },
  {
    id: 'financial-tech',
    name: 'Finanza & Mercati Tech (Teal)',
    category: 'preset',
    url: financialTechImg,
    description: 'Set contemporaneo con grafici finanziari, neon teal e atmosfera high-tech.',
  },
  {
    id: 'chroma-green',
    name: 'Chroma Key Green Screen',
    category: 'chroma',
    url: '',
    chromaColor: '#00b140',
    description: 'Schermo verde professionale per montaggio in post-produzione o compositing personalizzato.',
  },
  {
    id: 'chroma-blue',
    name: 'Chroma Key Studio Blue',
    category: 'chroma',
    url: '',
    chromaColor: '#0033cc',
    description: 'Schermo blu broadcast per chiavi cromatiche su indumenti caldi.',
  },
];
