import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

// Type definitions
interface Repository {
  name: string;
  description: string;
  url: string;
  stars: number;
  language: string;
  updated_at: string;
  owner: string;
  forks: number;
  topics?: string[];
  license?: string;
  open_issues?: number;
}

interface YouTubeVideo {
  title: string;
  description: string;
  url: string;
  thumbnail: string;
  channel: string;
  published_at: string;
  views: number;
  duration: string;
  tags?: string[];
  likes?: number;
  comments?: number;
}

interface StackOverflowQuestion {
  title: string;
  url: string;
  answers: number;
  votes: number;
  tags: string[];
  body: string;
  creation_date: number;
  view_count: number;
  is_answered: boolean;
  accepted_answer_id?: number;
  owner?: string;
}

interface ArXivPaper {
  title: string;
  authors: string[];
  published: string;
  summary: string;
  url: string;
  doi?: string;
  categories?: string[];
  pdf_url?: string;
}

interface ContextMatchItem {
  platform: string;
  title: string;
  url: string;
  similarity: number;
  match_reasons?: string[];
  metadata: any;
}

interface SearchResults {
  keyword: string;
  results: {
    github?: {
      repositories: Repository[];
      code_results: number;
      rate_limit?: {
        remaining: number;
        limit: number;
        reset: number;
      };
    };
    youtube?: YouTubeVideo[];
    stackoverflow?: StackOverflowQuestion[];
    arxiv?: ArXivPaper[];
  };
  context_matches?: Record<string, ContextMatchItem[]>;
  wikipedia?: any;
  knowledge_graph?: any;
  metadata?: {
    timestamp: string;
    processing_time: number;
  };
}

interface SavedSearch {
  keyword: string;
  timestamp: number;
  results?: SearchResults;
}

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h3>Something went wrong</h3>
          <p>Please try refreshing the page or try a different search.</p>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Skeleton Loading Components
const CardSkeleton = () => (
  <div className="card skeleton">
    <div className="skeleton-line shimmer" style={{ width: '80%' }}></div>
    <div className="skeleton-line shimmer" style={{ width: '60%' }}></div>
    <div className="skeleton-line shimmer" style={{ width: '40%' }}></div>
  </div>
);

const VideoCardSkeleton = () => (
  <div className="video-card skeleton">
    <div className="video-thumbnail-container skeleton-thumbnail"></div>
    <div className="video-info">
      <div className="skeleton-line" style={{ width: '90%' }}></div>
      <div className="skeleton-line" style={{ width: '70%' }}></div>
      <div className="skeleton-line" style={{ width: '50%' }}></div>
    </div>
  </div>
);

const ContextMatchSkeleton = () => (
  <div className="context-group skeleton">
    <div className="skeleton-line" style={{ width: '40%' }}></div>
    <div className="context-items">
      {[1, 2].map((i) => (
        <div key={i} className="context-item">
          <div className="skeleton-line" style={{ width: '60%' }}></div>
          <div className="skeleton-line" style={{ width: '80%' }}></div>
        </div>
      ))}
    </div>
  </div>
);

// Main App Component
function App() {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Initialize from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('themePreference');
    if (savedTheme) {
      setDarkMode(savedTheme === 'dark');
    }

    const savedRecent = localStorage.getItem('recentSearches');
    if (savedRecent) {
      setRecentSearches(JSON.parse(savedRecent));
    }

    const savedSearchesData = localStorage.getItem('savedSearches');
    if (savedSearchesData) {
      setSavedSearches(JSON.parse(savedSearchesData));
    }

    const savedPrivacyMode = localStorage.getItem('privacyMode');
    if (savedPrivacyMode) {
      setPrivacyMode(savedPrivacyMode === 'true');
    }
  }, []);

  // Apply theme
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('themePreference', 'dark');
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('themePreference', 'light');
    }
  }, [darkMode]);

  // Apply privacy mode
  useEffect(() => {
    localStorage.setItem('privacyMode', privacyMode.toString());
  }, [privacyMode]);

  // Focus search input on load
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const handleSearch = async (searchTerm = keyword) => {
    if (!searchTerm.trim()) {
      setError('Please enter a keyword');
      return;
    }
  
    setLoading(true);
    setError('');
    setResults(null);
    
    try {
      const response = await axios.get('http://localhost:5000/search', {  // Update this line
        params: { keyword: searchTerm }
      });
      
      setResults(response.data);
      setKeyword(searchTerm);
      
      // Update recent searches
      const updatedSearches = [
        searchTerm,
        ...recentSearches.filter(s => s !== searchTerm)
      ].slice(0, 5);
      setRecentSearches(updatedSearches);
      localStorage.setItem('recentSearches', JSON.stringify(updatedSearches));
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to fetch results. See console for details.');
    } finally {
      setLoading(false);
    }
  };

  const saveCurrentSearch = () => {
    if (!results) return;
    
    const newSavedSearch: SavedSearch = {
      keyword: results.keyword,
      timestamp: Date.now(),
      results: results
    };
    
    const updatedSearches = [
      newSavedSearch,
      ...savedSearches.filter(s => s.keyword !== results.keyword)
    ].slice(0, 10);
    
    setSavedSearches(updatedSearches);
    localStorage.setItem('savedSearches', JSON.stringify(updatedSearches));
  };

  const loadSavedSearch = (search: SavedSearch) => {
    if (search.results) {
      setResults(search.results);
      setKeyword(search.keyword);
    } else {
      handleSearch(search.keyword);
    }
    setShowSavedSearches(false);
  };

  const removeSavedSearch = (keyword: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedSearches = savedSearches.filter(s => s.keyword !== keyword);
    setSavedSearches(updatedSearches);
    localStorage.setItem('savedSearches', JSON.stringify(updatedSearches));
  };

  const formatDate = (dateString: string | number) => {
    const date = typeof dateString === 'number' 
      ? new Date(dateString * 1000) 
      : new Date(dateString);
      
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const formatViews = (views: number) => {
    if (views >= 1000000) {
      return `${(views / 1000000).toFixed(1)}M views`;
    } else if (views >= 1000) {
      return `${(views / 1000).toFixed(1)}K views`;
    }
    return `${views} views`;
  };

  const formatDuration = (duration: string) => {
    const hours = duration.match(/(\d+)H/);
    const minutes = duration.match(/(\d+)M/);
    const seconds = duration.match(/(\d+)S/);
    
    const h = hours ? `${hours[1]}h ` : '';
    const m = minutes ? `${minutes[1]}m ` : '';
    const s = seconds ? `${seconds[1]}s` : '';
    
    return `${h}${m}${s}`.trim() || '0m';
  };
  const PlatformIcon = ({ platform }: { platform: string }) => {
    const icon = getPlatformIcon(platform);
    const color = getPlatformColor(platform);
    
    return icon ? (
      <img 
        src={icon} 
        alt={platform} 
        className="platform-icon"
        style={{ backgroundColor: color }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    ) : (
      <span className="platform-icon-fallback">
        {platform.charAt(0).toUpperCase()}
      </span>
    );
  };

  const getPlatformIcon = (platform: string) => {
    switch(platform) {
      case 'github':
        return '/assets/github-mark.png';
      case 'youtube':
        return '/assets/youtube-icon.png';
      case 'stackoverflow':
        return '/assets/stackoverflow-icon.png';
      case 'arxiv':
        return '/assets/arxiv-icon.png';
      case 'wikipedia':
        return '/assets/wikipedia-icon.png';
      case 'google':
        return '/assets/google-icon.png';
      default:
        return '';
    }
  };

  const getPlatformColor = (platform: string) => {
    switch(platform) {
      case 'github':
        return '#181717';
      case 'youtube':
        return '#FF0000';
      case 'stackoverflow':
        return '#F48024';
      case 'arxiv':
        return '#B31B1B';
      default:
        return '#6B7280';
    }
  };

  const isSearchSaved = results ? savedSearches.some(s => s.keyword === results.keyword) : false;

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="title-section">
            <h1 className="app-title">
              <span className="title-gradient">Knowledge</span>
              <span className="title-highlight">Explorer</span>
            </h1>
            <p className="app-subtitle">Discover resources across multiple platforms</p>
          </div>
          
          <div className="header-controls">
            <button 
              className={`control-button ${darkMode ? 'active' : ''}`}
              onClick={() => setDarkMode(!darkMode)}
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              <span className="control-icon">{darkMode ? '☀️' : '🌙'}</span>
              {darkMode ? 'Light' : 'Dark'}
            </button>
            
            <button
              className={`control-button ${privacyMode ? 'active' : ''}`}
              onClick={() => setPrivacyMode(!privacyMode)}
              aria-label={privacyMode ? "Disable privacy mode" : "Enable privacy mode"}
            >
              <span className="control-icon">{privacyMode ? '🔓' : '🔒'}</span>
              {privacyMode ? 'Privacy Off' : 'Privacy On'}
            </button>
            
            <button
              className={`control-button ${showDebugInfo ? 'active' : ''}`}
              onClick={() => setShowDebugInfo(!showDebugInfo)}
              aria-label={showDebugInfo ? "Hide debug info" : "Show debug info"}
            >
              <span className="control-icon">🐞</span>
              {showDebugInfo ? 'Hide Debug' : 'Show Debug'}
            </button>
            
            {savedSearches.length > 0 && (
              <button
                className={`control-button ${showSavedSearches ? 'active' : ''}`}
                onClick={() => setShowSavedSearches(!showSavedSearches)}
                aria-label={showSavedSearches ? "Hide saved searches" : "Show saved searches"}
              >
                <span className="control-icon">💾</span>
                {showSavedSearches ? 'Hide Saved' : 'Show Saved'}
              </button>
            )}
          </div>

          <div className="search-section">
            <div className="search-container">
              <span className="search-icon">🔍</span>
              <input
                ref={searchInputRef}
                type="text"
                className="search-input"
                placeholder="Search for anything..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                disabled={loading}
              />
              {results && !isSearchSaved && (
                <button 
                  className="save-search-button"
                  onClick={saveCurrentSearch}
                  aria-label="Save this search"
                  title="Save this search"
                >
                  💾
                </button>
              )}
              <button
                className="search-button"
                onClick={() => handleSearch()}
                disabled={loading || !keyword.trim()}
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>

            {recentSearches.length > 0 && (
              <div className="recent-searches">
                <span className="recent-label">Recent:</span>
                {recentSearches.map((search, index) => (
                  <span
                    key={index}
                    className="recent-search-tag"
                    onClick={() => handleSearch(search)}
                  >
                    {search}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        {showSavedSearches && (
          <div className="saved-searches-modal">
            <h3>Saved Searches</h3>
            <div className="saved-searches-list">
              {savedSearches.map((search, index) => (
                <div 
                  key={index} 
                  className="saved-search-item"
                  onClick={() => loadSavedSearch(search)}
                >
                  <span className="saved-search-keyword">{search.keyword}</span>
                  <span className="saved-search-date">
                    {new Date(search.timestamp).toLocaleString()}
                  </span>
                  <button 
                    className="remove-saved-search"
                    onClick={(e) => removeSavedSearch(search.keyword, e)}
                    aria-label={`Remove saved search for ${search.keyword}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button 
              className="close-saved-searches"
              onClick={() => setShowSavedSearches(false)}
            >
              Close
            </button>
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {privacyMode && (
          <div className="privacy-notice">
            <h4 onClick={() => setShowPrivacyDetails(!showPrivacyDetails)}>
              <span>🔒</span> Privacy Mode Active
            </h4>
            {showPrivacyDetails && (
              <ul className="privacy-details">
                <li>No personal data is collected</li>
                <li>All searches are processed anonymously</li>
                <li>No cookies are used for tracking</li>
              </ul>
            )}
          </div>
        )}

        {loading ? (
          <div className="loading-skeletons">
            <CardSkeleton />
            <VideoCardSkeleton />
            <ContextMatchSkeleton />
          </div>
        ) : results ? (
          <ErrorBoundary>
            <div className="results-container">
              <h2 className="results-title">
                Results for <span className="keyword">{results.keyword}</span>
              </h2>

              {showDebugInfo && results.metadata && (
                <div className="debug-info">
                  <pre>{JSON.stringify(results.metadata, null, 2)}</pre>
                </div>
              )}

              {results.context_matches && Object.keys(results.context_matches).length > 0 && (
                <div className="context-section">
                  <h3 className="context-title">
                    <span className="context-icon">🔗</span>
                    Contextual Matches
                    <span className="context-subtitle">
                      Related content across platforms
                    </span>
                  </h3>

                  {Object.entries(results.context_matches).map(([group, items]) => (
                    <div key={group} className="context-group">
                      <div className="context-group-header">
                        <h4>Related Items</h4>
                        <span className="confidence-badge">
                          Confidence: {Math.max(...items.map(i => i.similarity * 100)).toFixed(0)}%
                        </span>
                      </div>
                      <div className="context-items">
                        {items.map((item, index) => (
                          <div key={index} className="context-item">
                            <div className="context-item-header">
                              <img 
                                src={getPlatformIcon(item.platform)} 
                                alt={item.platform} 
                                className="context-platform-icon"
                                style={{ backgroundColor: getPlatformColor(item.platform) }}
                              />
                              <span className="context-platform-name">
                                {item.platform.charAt(0).toUpperCase() + item.platform.slice(1)}
                              </span>
                              {item.similarity && (
                                <span className="context-similarity">
                                  {Math.round(item.similarity * 100)}% match
                                </span>
                              )}
                            </div>
                            <a 
                              href={item.url} 
                              className="context-item-title"
                              target="_blank" 
                              rel="noopener noreferrer"
                            >
                              {item.title}
                            </a>
                            {item.metadata && (
                              <div className="context-item-metadata">
                                {item.metadata.views && (
                                  <span className="context-meta-badge">
                                    👁️ {formatViews(item.metadata.views)}
                                  </span>
                                )}
                                {item.metadata.stars && (
                                  <span className="context-meta-badge">
                                    ⭐ {formatNumber(item.metadata.stars)}
                                  </span>
                                )}
                                {item.metadata.votes && (
                                  <span className="context-meta-badge">
                                    ▲ {formatNumber(item.metadata.votes)}
                                  </span>
                                )}
                              </div>
                            )}
                            {item.match_reasons && item.match_reasons.length > 0 && (
                              <div className="match-reasons">
                                Matched because: {item.match_reasons.join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {results?.wikipedia && (
                      <div className="platform-section wikipedia-section">
                        <div className="platform-header">
                          <PlatformIcon platform="wikipedia" />
                          <h3>Wikipedia</h3>
                          <span className="platform-badge">Authoritative Source</span>
                        </div>
                        <div className="card wikipedia-card">
                          <div className="card-header">
                            <h4>{results.wikipedia.title}</h4>
                            {results.wikipedia.last_edited && (
                              <span className="last-edited">
                                Last edited: {formatDate(results.wikipedia.last_edited)}
                              </span>
                            )}
                          </div>
                          <p className="card-description">
                            {results.wikipedia.summary}
                            {results.wikipedia.summary.length >= 500 && '...'}
                          </p>
                          {results.wikipedia.categories?.length > 0 && (
                            <div className="categories">
                              {results.wikipedia.categories.slice(0, 3).map((cat: string, i: React.Key | null | undefined) => (
                                <span key={i} className="category-tag">
                                  {cat.replace('Category:', '')}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="card-footer">
                            <a 
                              href={results.wikipedia.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="read-more-link"
                            >
                              Read more on Wikipedia
                              <span className="external-link-icon">↗</span>
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

              {results.knowledge_graph && (
                <div className="platform-section">
                  <div className="platform-header">
                    <img src={getPlatformIcon('google')} alt="Google" className="platform-icon" />
                    <h3>Knowledge Graph</h3>
                  </div>
                  <div className="card">
                    <div className="card-header">
                      <h4>{results.knowledge_graph.title}</h4>
                    </div>
                    <p className="card-description">
                      {results.knowledge_graph.description}
                    </p>
                    {results.knowledge_graph.image && (
                      <img 
                        src={results.knowledge_graph.image} 
                        alt={results.knowledge_graph.title}
                        style={{ maxWidth: '100%', height: 'auto', margin: '1rem' }}
                      />
                    )}
                    <div className="card-footer">
                      <a href={results.knowledge_graph.url} target="_blank" rel="noopener noreferrer">
                        View more details
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {results.results?.github && (
                <div className="platform-section">
                  <div className="platform-header">
                    <img src={getPlatformIcon('github')} alt="GitHub" className="platform-icon" />
                    <h3>GitHub Repositories</h3>
                    <div className="platform-stats">
                      <span className="stat-badge">
                        {results.results.github.repositories.length} repos
                      </span>
                      <span className="stat-badge">
                        {formatNumber(results.results.github.code_results)} code results
                      </span>
                      {results.results.github.rate_limit && (
                        <span className="stat-badge">
                          {results.results.github.rate_limit.remaining}/{results.results.github.rate_limit.limit} API calls left
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="cards-grid">
                    {results.results.github.repositories.map((repo, index) => (
                      <div key={index} className="card repo-card">
                        <div className="card-header">
                          <div className="repo-title">
                            <a href={repo.url} target="_blank" rel="noopener noreferrer">
                              {repo.name}
                            </a>
                            <span className="stars">
                              ⭐ {formatNumber(repo.stars)}
                            </span>
                          </div>
                          {repo.language && (
                            <span className="language-tag">
                              {repo.language}
                            </span>
                          )}
                        </div>
                        {repo.description && (
                          <p className="card-description">
                            {repo.description}
                          </p>
                        )}
                        {repo.topics && repo.topics.length > 0 && (
                          <div className="repo-topics">
                            {repo.topics.slice(0, 5).map((topic, i) => (
                              <span key={i} className="topic-tag">
                                {topic}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="card-footer">
                          <span className="repo-owner">
                            by {repo.owner}
                          </span>
                          <span>
                            Updated {formatDate(repo.updated_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.results?.youtube && (
                <div className="platform-section">
                  <div className="platform-header">
                    <img src={getPlatformIcon('youtube')} alt="YouTube" className="platform-icon" />
                    <h3>YouTube Videos</h3>
                    <div className="platform-stats">
                      <span className="stat-badge">
                        {results.results.youtube.length} videos
                      </span>
                    </div>
                  </div>
                  <div className="horizontal-scroll">
                    {results.results.youtube.map((video, index) => (
                      <div key={index} className="video-card">
                        <a href={video.url} target="_blank" rel="noopener noreferrer">
                          <div className="video-thumbnail-container">
                            <img 
                              src={video.thumbnail} 
                              alt={video.title} 
                              className="video-thumbnail"
                            />
                            <div className="play-overlay">
                              <span className="play-icon">▶</span>
                            </div>
                          </div>
                          <div className="video-info">
                            <h4 className="video-title">{video.title}</h4>
                            <p className="video-channel">{video.channel}</p>
                            <div className="video-metadata">
                              <span>{formatViews(video.views)}</span>
                              <span>{formatDuration(video.duration)}</span>
                            </div>
                            <p className="video-date">
                              {formatDate(video.published_at)}
                            </p>
                            {video.tags && video.tags.length > 0 && (
                              <div className="video-tags">
                                {video.tags.slice(0, 3).map((tag, i) => (
                                  <span key={i} className="tag">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.results?.stackoverflow && (
                <div className="platform-section">
                  <div className="platform-header">
                    <img src={getPlatformIcon('stackoverflow')} alt="StackOverflow" className="platform-icon" />
                    <h3>StackOverflow Questions</h3>
                    <div className="platform-stats">
                      <span className="stat-badge">
                        {results.results.stackoverflow.length} questions
                      </span>
                    </div>
                  </div>
                  <div className="cards-grid">
                    {results.results.stackoverflow.map((question, index) => (
                      <div key={index} className="card question-card">
                        <div className="question-stats">
                          <div className={`vote-count ${question.votes > 0 ? 'has-votes' : ''}`}>
                            <span className="stat-number">{formatNumber(question.votes)}</span>
                            <span className="stat-label">votes</span>
                          </div>
                          <div className={`answer-count ${question.answers > 0 ? 'has-answers' : ''}`}>
                            <span className="stat-number">{formatNumber(question.answers)}</span>
                            <span className="stat-label">answers</span>
                          </div>
                        </div>
                        <div className="question-content">
                          <a href={question.url} target="_blank" rel="noopener noreferrer">
                            <h4 className="question-title">{question.title}</h4>
                          </a>
                          <div className="tags-container">
                            {question.tags.map((tag, i) => (
                              <span key={i} className="tag">
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="question-meta">
                            <span>
                              {question.owner && `by ${question.owner}`}
                            </span>
                            <span>
                              {formatDate(question.creation_date)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.results?.arxiv && (
                <div className="platform-section">
                  <div className="platform-header">
                    <img src={getPlatformIcon('arxiv')} alt="ArXiv" className="platform-icon" />
                    <h3>ArXiv Papers</h3>
                    <div className="platform-stats">
                      <span className="stat-badge">
                        {results.results.arxiv.length} papers
                      </span>
                    </div>
                  </div>
                  <div className="papers-list">
                    {results.results.arxiv.map((paper, index) => (
                      <div key={index} className="card paper-card">
                        <div className="paper-header">
                          <h4 className="paper-title">
                            <a href={paper.url} target="_blank" rel="noopener noreferrer">
                              {paper.title}
                            </a>
                          </h4>
                          {paper.doi && (
                            <span className="paper-doi">
                              DOI: {paper.doi}
                            </span>
                          )}
                        </div>
                        <div className="paper-meta">
                          <span className="authors">
                            {paper.authors.slice(0, 3).join(', ')}
                            {paper.authors.length > 3 ? ' et al.' : ''}
                          </span>
                          <span>
                            {formatDate(paper.published)}
                          </span>
                        </div>
                        {paper.summary && (
                          <p className="paper-abstract">
                            {paper.summary.substring(0, 200)}...
                          </p>
                        )}
                        {paper.categories && paper.categories.length > 0 && (
                          <div className="paper-categories">
                            {paper.categories.slice(0, 5).map((category, i) => (
                              <span key={i} className="category-tag">
                                {category}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ErrorBoundary>
        ) : null}
      </main>

      <footer className="app-footer">
        <p>Knowledge Explorer © {new Date().getFullYear()}</p>
        <div className="footer-links">
          <a href="github.com/aswathiir" target="_blank" rel="noopener noreferrer">About</a>
          <a href="google.com" target="_blank" rel="noopener noreferrer">Privacy</a>
          <a href="google.com" target="_blank" rel="noopener noreferrer">Terms</a>
          <a href="linkedin.com/n/aswathi-ranjith" target="_blank" rel="noopener noreferrer">Contact</a>
        </div>
      </footer>
    </div>
  );
}

export default App;