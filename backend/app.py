from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv
from bs4 import BeautifulSoup
import time
import spacy
from collections import defaultdict
import wikipediaapi
from serpapi import GoogleSearch
import logging
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={
    r"/search": {"origins": "http://localhost:3000"},
    r"/health": {"origins": "*"}
})

# Configuration
DEBUG = os.getenv('DEBUG', 'False').lower() in ('true', '1', 't')
CACHE_TIMEOUT = int(os.getenv('CACHE_TIMEOUT', '300'))  # 5 minutes
MAX_RESULTS = int(os.getenv('MAX_RESULTS', '5'))

# Cache setup
cache = {}

def get_cached_data(key):
    """Retrieve cached data if it exists and isn't expired"""
    if key in cache:
        data, timestamp = cache[key]
        if time.time() - timestamp < CACHE_TIMEOUT:
            logger.debug(f"Cache hit for {key}")
            return data
    return None

def set_cache_data(key, data):
    """Store data in cache with timestamp"""
    cache[key] = (data, time.time())
    logger.debug(f"Data cached for {key}")

# Initialize NLP model
try:
    nlp = spacy.load('en_core_web_md')
except OSError:
    logger.info("Downloading spaCy model...")
    import spacy.cli
    spacy.cli.download('en_core_web_md')
    nlp = spacy.load('en_core_web_md')

# Knowledge APIs
def get_wikipedia_entities(keyword):
    """Fetch Wikipedia data for a keyword"""
    cache_key = f"wiki_{keyword}"
    cached = get_cached_data(cache_key)
    if cached:
        return cached
        
    wiki = wikipediaapi.Wikipedia(
        user_agent='KnowledgeExplorer/2.0',
        language='en'
    )
    page = wiki.page(keyword)
    if not page.exists():
        return None
        
    result = {
        "title": page.title,
        "summary": page.summary[:500],
        "categories": list(page.categories.keys()),
        "url": page.fullurl,
        "last_edited": page.lastrevid  # Using revision ID as a proxy for last edited
    }
    
    set_cache_data(cache_key, result)
    return result

def get_google_knowledge_graph(keyword):
    """Fetch Google Knowledge Graph data"""
    if not os.getenv('SERPAPI_KEY'):
        logger.warning("SERPAPI_KEY not configured")
        return None
        
    cache_key = f"kg_{keyword}"
    cached = get_cached_data(cache_key)
    if cached:
        return cached
        
    params = {
        "engine": "google",
        "q": keyword,
        "api_key": os.getenv("SERPAPI_KEY"),
        "hl": "en"
    }
    
    try:
        search = GoogleSearch(params)
        results = search.get_dict()
        kg_data = results.get("knowledge_graph")
        
        if kg_data:
            # Standardize the response format
            standardized = {
                "title": kg_data.get("title", ""),
                "description": kg_data.get("description", ""),
                "url": kg_data.get("url", ""),
                "attributes": kg_data.get("attributes", {}),
                "type": kg_data.get("type", ""),
                "image": kg_data.get("image", {}).get("src", "") if kg_data.get("image") else ""
            }
            set_cache_data(cache_key, standardized)
            return standardized
        return None
    except Exception as e:
        logger.error(f"Knowledge Graph error: {e}")
        return None

# Platform APIs
def search_github(keyword):
    """Search GitHub repositories and code"""
    cache_key = f"github_{keyword}"
    cached = get_cached_data(cache_key)
    if cached:
        return cached
        
    token = os.getenv('GITHUB_TOKEN')
    headers = {'Authorization': f'token {token}'} if token else {}
    
    try:
        # Search repositories
        repos_url = f"https://api.github.com/search/repositories?q={keyword}&sort=stars&order=desc&per_page={MAX_RESULTS}"
        repos_res = requests.get(repos_url, headers=headers, timeout=10)
        repos_res.raise_for_status()
        repos_data = repos_res.json()
        
        # Get topics for each repo
        repos = []
        for item in repos_data.get("items", [])[:MAX_RESULTS]:
            repo = {
                "name": item["full_name"],
                "description": item.get("description"),
                "url": item["html_url"],
                "stars": item["stargazers_count"],
                "language": item["language"],
                "updated_at": item["updated_at"],
                "owner": item["owner"]["login"],
                "forks": item["forks_count"],
                "license": item.get("license", {}).get("name") if item.get("license") else None,
                "open_issues": item.get("open_issues_count", 0)
            }
            
            # Get repository topics
            topics_url = f"https://api.github.com/repos/{repo['owner']}/{repo['name'].split('/')[-1]}/topics"
            topics_headers = {**headers, 'Accept': 'application/vnd.github.mercy-preview+json'}
            topics_res = requests.get(topics_url, headers=topics_headers, timeout=5)
            if topics_res.status_code == 200:
                repo['topics'] = topics_res.json().get('names', [])
            else:
                repo['topics'] = []
                
            repos.append(repo)
        
        # Search code (just count)
        code_url = f"https://api.github.com/search/code?q={keyword}"
        code_res = requests.get(code_url, headers=headers, timeout=10)
        code_res.raise_for_status()
        code_data = code_res.json()
        
        result = {
            "repositories": repos,
            "code_results": code_data.get("total_count", 0),
            "rate_limit": {
                "remaining": int(repos_res.headers.get('X-RateLimit-Remaining', 0)),
                "limit": int(repos_res.headers.get('X-RateLimit-Limit', 0)),
                "reset": int(repos_res.headers.get('X-RateLimit-Reset', 0))
            }
        }
        set_cache_data(cache_key, result)
        return result
    except Exception as e:
        logger.error(f"GitHub Error: {e}")
        return None

def search_youtube(keyword):
    """Search YouTube videos"""
    cache_key = f"youtube_{keyword}"
    cached = get_cached_data(cache_key)
    if cached:
        return cached
        
    API_KEY = os.getenv('YOUTUBE_API_KEY')
    if not API_KEY:
        logger.warning("YOUTUBE_API_KEY not configured")
        return None
        
    try:
        # Search videos
        search_url = f"https://www.googleapis.com/youtube/v3/search?part=snippet&q={keyword}&type=video&maxResults={MAX_RESULTS}&key={API_KEY}"
        search_res = requests.get(search_url, timeout=10)
        search_res.raise_for_status()
        search_data = search_res.json()
        
        video_ids = [item['id']['videoId'] for item in search_data.get("items", [])]
        
        # Get video details
        videos = []
        if video_ids:
            details_url = f"https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id={','.join(video_ids)}&key={API_KEY}"
            details_res = requests.get(details_url, timeout=10)
            details_res.raise_for_status()
            details_data = details_res.json()
            
            for item in search_data.get("items", []):
                video_id = item['id']['videoId']
                details = next((v for v in details_data.get('items', []) if v['id'] == video_id), None)
                
                if not details:
                    continue
                    
                videos.append({
                    "title": item["snippet"]["title"],
                    "description": item["snippet"]["description"],
                    "url": f"https://youtube.com/watch?v={video_id}",
                    "thumbnail": item["snippet"]["thumbnails"]["high"]["url"],
                    "channel": item["snippet"]["channelTitle"],
                    "published_at": item["snippet"]["publishedAt"],
                    "views": int(details['statistics']['viewCount']),
                    "duration": details['contentDetails']['duration'],
                    "tags": details['snippet'].get('tags', []),
                    "likes": int(details['statistics'].get('likeCount', 0)),
                    "comments": int(details['statistics'].get('commentCount', 0))
                })
        
        set_cache_data(cache_key, videos)
        return videos
    except Exception as e:
        logger.error(f"YouTube Error: {e}")
        return None

def search_stackoverflow(keyword):
    """Search StackOverflow questions"""
    cache_key = f"stackoverflow_{keyword}"
    cached = get_cached_data(cache_key)
    if cached:
        return cached
        
    try:
        url = f"https://api.stackexchange.com/2.3/search?order=desc&sort=votes&intitle={keyword}&site=stackoverflow&filter=withbody&pagesize={MAX_RESULTS}"
        res = requests.get(url, timeout=10)
        res.raise_for_status()
        data = res.json()
        
        questions = []
        for item in data.get("items", [])[:MAX_RESULTS]:
            questions.append({
                "title": item["title"],
                "url": item["link"],
                "answers": item["answer_count"],
                "votes": item["score"],
                "tags": item["tags"][:5],
                "body": item.get("body", ""),
                "creation_date": item["creation_date"],
                "view_count": item.get("view_count", 0),
                "is_answered": item.get("is_answered", False),
                "accepted_answer_id": item.get("accepted_answer_id"),
                "owner": item.get("owner", {}).get("display_name") if item.get("owner") else None
            })
        
        set_cache_data(cache_key, questions)
        return questions
    except Exception as e:
        logger.error(f"StackOverflow Error: {e}")
        return None

def search_arxiv(keyword):
    """Search ArXiv papers"""
    cache_key = f"arxiv_{keyword}"
    cached = get_cached_data(cache_key)
    if cached:
        return cached
        
    try:
        url = f"http://export.arxiv.org/api/query?search_query=all:{keyword}&start=0&max_results={MAX_RESULTS}"
        res = requests.get(url, timeout=10)
        res.raise_for_status()
        
        soup = BeautifulSoup(res.text, "lxml-xml")
        
        papers = []
        for entry in soup.find_all("entry"):
            authors = [author.find("name").text for author in entry.find_all("author")]
            summary = entry.summary.text.replace('\n', ' ').strip() if entry.summary else ""
            
            papers.append({
                "title": entry.title.text,
                "authors": authors,
                "published": entry.published.text,
                "summary": summary,
                "url": entry.link["href"],
                "doi": entry.doi.text if entry.doi else None,
                "categories": [cat.get("term") for cat in entry.find_all("category")],
                "pdf_url": entry.link["href"].replace('abs', 'pdf') if entry.link["href"] else None
            })
        
        set_cache_data(cache_key, papers)
        return papers
    except Exception as e:
        logger.error(f"ArXiv Error: {e}")
        return None

# NLP and Context Matching
def extract_entities(text):
    """Extract named entities from text using NLP"""
    if not text:
        return []
    doc = nlp(text)
    return [ent.text for ent in doc.ents]

def is_technical_content(text):
    """Check if content appears to be technical"""
    tech_keywords = {
        'software', 'library', 'framework', 'api', 'algorithm',
        'development', 'code', 'programming', 'system', 'engineering',
        'computer', 'data', 'science', 'machine', 'learning', 'ai',
        'neural', 'network', 'database', 'server', 'cloud'
    }
    doc = nlp(text.lower())
    return any(token.text in tech_keywords for token in doc)

def is_music_content(text):
    """Check if content appears to be music-related"""
    music_keywords = {
        'song', 'music', 'lyrics', 'album', 'artist', 'band',
        'track', 'sing', 'melody', 'video', 'official', 'cover',
        'guitar', 'piano', 'drum', 'bass', 'violin', 'concert'
    }
    doc = nlp(text.lower())
    return any(token.text in music_keywords for token in doc)

def calculate_enhanced_similarity(item1, item2):
    """Calculate similarity score between two items with NLP"""
    # Content type mismatch penalty
    if (is_technical_content(item1['content']) and is_music_content(item2['content'])) or \
       (is_music_content(item1['content']) and is_technical_content(item2['content'])):
        return 0.0
        
    features = []
    
    # Title similarity (40% weight)
    title_sim = nlp(item1['title']).similarity(nlp(item2['title']))
    features.append(title_sim * 0.4)
    
    # Description similarity (30% weight)
    if item1.get('description') and item2.get('description'):
        desc_sim = nlp(item1['description']).similarity(nlp(item2['description']))
        features.append(desc_sim * 0.3)
    
    # Entity matching (30% weight)
    entities1 = set(extract_entities(item1['content']))
    entities2 = set(extract_entities(item2['content']))
    entity_overlap = len(entities1 & entities2) / max(1, len(entities1 | entities2))
    features.append(entity_overlap * 0.3)
    
    # Platform-specific boosts
    if item1['platform'] == 'github' and item2['platform'] == 'arxiv':
        # GitHub repo and academic paper
        if any(topic in item2['title'].lower() for topic in item1.get('topics', [])):
            features.append(0.2)
            
    elif item1['platform'] == 'youtube' and item2['platform'] == 'stackoverflow':
        # YouTube video and StackOverflow question
        if any(tag in item1['title'].lower() for tag in item2.get('tags', [])):
            features.append(0.1)
    
    return min(sum(features), 1.0)

def find_context_matches(results, keyword):
    """Find related content across different platforms"""
    # Get authoritative knowledge
    wiki_entity = get_wikipedia_entities(keyword)
    kg_entity = get_google_knowledge_graph(keyword)
    
    canonical_names = set()
    if wiki_entity:
        canonical_names.add(wiki_entity['title'].lower())
    if kg_entity and 'title' in kg_entity:
        canonical_names.add(kg_entity['title'].lower())
    
    # Prepare all items
    all_items = []
    
    # GitHub repositories
    if results.get('github') and results['github'].get('repositories'):
        for repo in results['github']['repositories']:
            content = f"{repo['name']} {repo.get('description', '')}"
            all_items.append({
                'platform': 'github',
                'title': repo['name'],
                'description': repo.get('description'),
                'url': repo['url'],
                'content': content,
                'topics': repo.get('topics', []),
                'language': repo['language'],
                'is_canonical': any(cn in repo['name'].lower() for cn in canonical_names),
                'metadata': {
                    'stars': repo['stars'],
                    'forks': repo['forks'],
                    'updated_at': repo['updated_at']
                }
            })
    
    # YouTube videos
    if results.get('youtube'):
        for video in results['youtube']:
            content = f"{video['title']} {video.get('description', '')}"
            all_items.append({
                'platform': 'youtube',
                'title': video['title'],
                'description': video.get('description'),
                'url': video['url'],
                'content': content,
                'tags': video.get('tags', []),
                'is_canonical': any(cn in video['title'].lower() for cn in canonical_names),
                'metadata': {
                    'views': video['views'],
                    'likes': video['likes'],
                    'comments': video['comments'],
                    'duration': video['duration']
                }
            })
    
    # StackOverflow questions
    if results.get('stackoverflow'):
        for question in results['stackoverflow']:
            content = f"{question['title']} {question.get('body', '')[:200]}"
            all_items.append({
                'platform': 'stackoverflow',
                'title': question['title'],
                'description': question.get('body', '')[:200],
                'url': question['url'],
                'content': content,
                'tags': question.get('tags', []),
                'is_canonical': any(cn in question['title'].lower() for cn in canonical_names),
                'metadata': {
                    'votes': question['votes'],
                    'answers': question['answers'],
                    'views': question['view_count'],
                    'is_answered': question['is_answered']
                }
            })
    
    # ArXiv papers
    if results.get('arxiv'):
        for paper in results['arxiv']:
            content = f"{paper['title']} {paper.get('summary', '')}"
            all_items.append({
                'platform': 'arxiv',
                'title': paper['title'],
                'description': paper.get('summary'),
                'url': paper['url'],
                'content': content,
                'categories': paper.get('categories', []),
                'is_canonical': any(cn in paper['title'].lower() for cn in canonical_names),
                'metadata': {
                    'authors': paper['authors'],
                    'published': paper['published'],
                    'categories': paper.get('categories', [])
                }
            })
    
    # Find matches
    matches = defaultdict(list)
    for i, item1 in enumerate(all_items):
        for j, item2 in enumerate(all_items[i+1:], i+1):
            # Skip same platform
            if item1['platform'] == item2['platform']:
                continue
                
            # At least one should be canonical
            if not (item1['is_canonical'] or item2['is_canonical']):
                continue
                
            similarity = calculate_enhanced_similarity(item1, item2)
            if similarity > 0.65:  # Confidence threshold
                group_key = f"match_{len(matches)+1}"
                
                # Create match data for item1
                match_data1 = {
                    'platform': item1['platform'],
                    'title': item1['title'],
                    'url': item1['url'],
                    'similarity': similarity,
                    'match_reasons': [],
                    'metadata': item1['metadata']
                }
                
                if item1['is_canonical']:
                    match_data1['match_reasons'].append('canonical_name_match')
                if 'topics' in item1 and any(topic in item2['title'].lower() for topic in item1['topics']):
                    match_data1['match_reasons'].append('shared_topic')
                if 'tags' in item1 and any(tag in item2['title'].lower() for tag in item1['tags']):
                    match_data1['match_reasons'].append('shared_tag')
                
                # Create match data for item2
                match_data2 = {
                    'platform': item2['platform'],
                    'title': item2['title'],
                    'url': item2['url'],
                    'similarity': similarity,
                    'match_reasons': [],
                    'metadata': item2['metadata']
                }
                
                if item2['is_canonical']:
                    match_data2['match_reasons'].append('canonical_name_match')
                if 'topics' in item2 and any(topic in item1['title'].lower() for topic in item2['topics']):
                    match_data2['match_reasons'].append('shared_topic')
                if 'tags' in item2 and any(tag in item1['title'].lower() for tag in item2['tags']):
                    match_data2['match_reasons'].append('shared_tag')
                
                # Add both items to the match group
                matches[group_key].append(match_data1)
                matches[group_key].append(match_data2)
    
    return dict(matches)

# API Endpoints
@app.route('/search', methods=['GET'])
def search():
    """Main search endpoint"""
    keyword = request.args.get('keyword', '').strip()
    if not keyword:
        return jsonify({"error": "Empty keyword"}), 400
    
    try:
        start_time = time.time()
        
        # Search all platforms in parallel (in a real app, use threading)
        results = {
            "github": search_github(keyword),
            "youtube": search_youtube(keyword),
            "stackoverflow": search_stackoverflow(keyword),
            "arxiv": search_arxiv(keyword)
        }
        
        # Remove None values
        results = {k: v for k, v in results.items() if v is not None}
        
        # Find context matches
        context_matches = find_context_matches(results, keyword)
        
        # Get authoritative knowledge
        wiki_entity = get_wikipedia_entities(keyword)
        kg_entity = get_google_knowledge_graph(keyword)
        
        response = {
            "keyword": keyword,
            "results": results,
            "context_matches": context_matches,
            "wikipedia": wiki_entity,
            "knowledge_graph": kg_entity,
            "metadata": {
                "timestamp": datetime.utcnow().isoformat(),
                "processing_time": round(time.time() - start_time, 2)
            }
        }
        
        logger.info(f"Search completed for '{keyword}' in {response['metadata']['processing_time']}s")
        return jsonify(response)
    except Exception as e:
        logger.error(f"Search error for '{keyword}': {str(e)}")
        return jsonify({
            "error": str(e),
            "keyword": keyword
        }), 500

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "cache_size": len(cache),
        "memory_usage": f"{len(cache) * 100 / 1000:.1f}KB"  # Simplified estimation
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', '5000'))
    app.run(host='0.0.0.0', port=port, debug=DEBUG)