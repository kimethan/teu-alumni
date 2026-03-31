const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProfileInput {
  full_name: string;
  company: string;
}

interface NewsResult {
  title: string;
  link: string;
  source: string;
  snippet: string;
  alumni_name: string;
  company: string;
}

async function searchGoogleNews(query: string): Promise<{ title: string; link: string; source: string; snippet: string }[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://news.google.com/rss/search?q=${encoded}&hl=ko&gl=KR&ceid=KR:ko`;
  
  try {
    const res = await fetch(url);
    const xml = await res.text();
    
    const items: { title: string; link: string; source: string; snippet: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const itemXml = match[1];
      const title = itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') || '';
      const link = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || '';
      const source = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') || 'Google News';
      const description = itemXml.match(/<description>([\s\S]*?)<\/description>/)?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')?.replace(/<[^>]*>/g, '') || '';
      
      if (title && link) {
        items.push({ title, link, source, snippet: description.slice(0, 200) });
      }
    }
    
    return items;
  } catch (e) {
    console.error('Google News search error:', e);
    return [];
  }
}

async function searchNaverNews(query: string): Promise<{ title: string; link: string; source: string; snippet: string }[]> {
  // Naver search via RSS (no API key needed)
  const encoded = encodeURIComponent(query);
  const url = `https://search.naver.com/search.naver?where=news&query=${encoded}&sm=tab_jum&ie=utf8`;
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TEUAlumniBot/1.0)' },
    });
    const html = await res.text();
    
    const items: { title: string; link: string; source: string; snippet: string }[] = [];
    
    // Parse news items from Naver search results HTML
    const titleRegex = /class="news_tit"[^>]*href="([^"]*)"[^>]*title="([^"]*)"/g;
    let m;
    while ((m = titleRegex.exec(html)) !== null && items.length < 5) {
      items.push({
        title: m[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'),
        link: m[1],
        source: '네이버 뉴스',
        snippet: '',
      });
    }
    
    return items;
  } catch (e) {
    console.error('Naver search error:', e);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { profiles } = await req.json() as { profiles: ProfileInput[] };
    
    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allResults: NewsResult[] = [];

    for (const profile of profiles.slice(0, 10)) {
      const query = profile.company
        ? `"${profile.company}" "${profile.full_name}"`
        : `"${profile.full_name}"`;
      
      const [googleResults, naverResults] = await Promise.all([
        searchGoogleNews(query),
        searchNaverNews(query),
      ]);

      for (const item of [...googleResults, ...naverResults]) {
        allResults.push({
          ...item,
          alumni_name: profile.full_name,
          company: profile.company,
        });
      }
    }

    // Deduplicate by title similarity
    const seen = new Set<string>();
    const unique = allResults.filter(item => {
      const key = item.title.slice(0, 30).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return new Response(
      JSON.stringify({ results: unique.slice(0, 30) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message, results: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
