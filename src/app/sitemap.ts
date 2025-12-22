import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://smartsendhq.com'
  
  return [
    { 
      url: base, 
      lastModified: new Date(),
      changeFrequency: 'weekly', 
      priority: 1.0 
    },
    { 
      url: `${base}/pricing`, 
      lastModified: new Date(),
      changeFrequency: 'monthly', 
      priority: 0.8 
    },
    { 
      url: `${base}/legal/privacy`, 
      lastModified: new Date(),
      changeFrequency: 'yearly', 
      priority: 0.3 
    },
    { 
      url: `${base}/legal/terms`, 
      lastModified: new Date(),
      changeFrequency: 'yearly', 
      priority: 0.3 
    },
    { 
      url: `${base}/legal/dpa`, 
      lastModified: new Date(),
      changeFrequency: 'yearly', 
      priority: 0.3 
    },
  ]
}

