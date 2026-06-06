# Law Document Ingestion & RAG Pipeline Flow

## Overview
This document traces the complete flow of a **Law document** through the RegWatch system, from upload to retrieval, including function calls, purposes, and improvement opportunities.

---

## Phase 1: Upload & Initial Setup

### Flow Diagram
```
Client Upload Request
    ↓
POST /v1/documents/upload (documents.py:26-72)
    ↓
Validation: extension, file size
    ↓
Create DB Record (PENDING status)
    ↓
Upload original file to MinIO
    ↓
Return 202 Accepted + doc_id
    ↓
Enqueue Background Pipeline Task
```

### Step-by-Step Breakdown

#### 1. **Endpoint Handler: `upload_document()`**
- **File**: `backend/app/routers/documents.py:26`
- **Purpose**: Accept file upload, validate it, store metadata, trigger async processing
- **Key Actions**:
  - Validate file extension (`.pdf`, `.docx`, `.doc`)
  - Check file size (max 50 MB)
  - Read file content into memory
  - Create database record with status=PENDING

#### 2. **Document Creation: `create_pending_document()`**
- **File**: `backend/app/services/document.py:39`
- **Purpose**: Create database record for tracking
- **Details**:
  - Extracts filename stem as document title
  - Initializes `processing_log` JSON array
  - Records initial log entry with timestamp
  - Commits to MySQL immediately → returns doc_id for polling

#### 3. **File Storage: `store_original_file()`**
- **File**: `backend/app/services/document.py:157`
- **Purpose**: Archive original file for user download
- **Details**:
  - Connects to MinIO (object storage)
  - Creates object key: `documents/{doc_id}/{uuid}.{ext}`
  - Stores with metadata: original filename
  - Returns object key for DB reference
  - **Note**: Runs off event loop via `asyncio.to_thread()` (MinIO SDK is sync)

#### 4. **Attachment & Response: `attach_stored_file()` + Return**
- **File**: `backend/app/services/document.py:57`
- **Purpose**: Link stored file to DB record
- **Response**: 
  - HTTP 202 Accepted (immediate return)
  - Returns DocumentResponse with doc_id
  - Client can poll via `GET /v1/documents/{doc_id}` to check status

#### 5. **Background Task Enqueue: `background_tasks.add_task()`**
- **File**: `backend/app/routers/documents.py:63`
- **Purpose**: Hand off processing to background pipeline
- **Details**:
  - Calls `pipeline_process_and_embed_law()` asynchronously
  - Passes: doc_id, filename, file_content, kb_type
  - Returns immediately; processing happens in background

---

## Phase 2: Document Ingestion Pipeline (Background)

### Flow Diagram
```
Background Pipeline Task Starts
    ↓
[PROCESSING status]
    ↓
Parse → Clean → Chunk → Embed → Store
    ↓
[COMPLETED/FAILED status]
```

### Main Orchestrator: `pipeline_process_and_embed_law()`
- **File**: `backend/app/services/document.py:87`
- **Purpose**: Orchestrate entire 3-step pipeline with error handling
- **Pattern**: Sync calls via `asyncio.to_thread()` (DB operations and processing are sync)
- **Status Updates**: PENDING → PROCESSING → COMPLETED/FAILED
- **Logging**: Print statements + structured logs with timing

---

## Phase 2.1: Parse

### Step 1: **Parse Document: `parse_document()`**
- **File**: `backend/app/services/parser.py:20`
- **Purpose**: Extract raw text from binary file
- **Dispatcher**: Routes by file extension

#### Sub-steps:

**1a. PDF Parsing: `parse_pdf()`**
- **Library**: PyMuPDF (fitz)
- **Process**:
  - Opens PDF from bytes
  - Iterates all pages: `page.get_text()`
  - Joins pages with newlines
  - **Issue**: No document structure preservation (doesn't use semantic chunking)

**1b. DOCX Parsing: `parse_docx()`**
- **Library**: python-docx
- **Process**:
  - Loads DOCX from BytesIO
  - Extracts paragraph text
  - Joins non-empty paragraphs
  - **Limitation**: Loses formatting, tables, headers/footers

**Output**: Single raw text string (no structure markers)

---

## Phase 2.2: Clean

### Step 2: **Text Cleaning: `clean_legal_text()`**
- **File**: `backend/app/utils/text_processor.py:17`
- **Purpose**: Normalize text while preserving legal document structure
- **Process**:

```
1. Unicode normalization (NFC)
2. Remove carriage returns & form feeds
3. Extract and replace page markers (<PARSED TEXT FOR PAGE: ...>)
4. Remove page number lines (- N -, Trang X, Page X)
5. Normalize whitespace (collapse multiple spaces)
6. Fix punctuation spacing
7. REINFORCE legal sections → add double newlines before:
   - Chương (Chapter)
   - Mục (Section)
   - Điều (Article)
8. Merge broken lines (smart line joining)
9. Reduce 3+ newlines to 2 newlines
10. Strip trailing whitespace from lines
```

#### Sub-step: **Line Merging: `merge_broken_lines()`**
- **Purpose**: Rejoin lines broken across PDF pages while preserving structure
- **Smart Rules**: 
  - DON'T merge if line starts with legal section (Chương, Mục, Điều, Khoản, etc.)
  - DON'T merge numbered lists (1., 2., etc.)
  - DON'T merge lettered lists (a), b), etc.)
  - DON'T merge if previous line ends with punctuation (., !, ?, :, ;)
  - DO merge continuation lines
- **Pattern**: `LEGAL_SECTION_PATTERN` regex for structure detection

**Output**: Cleaned text with reinforced legal structure markers

### 🔍 **Issue #1: Information Loss in PDF Parsing**
- PDF parser doesn't preserve any structural information (chapters, articles)
- Everything is treated as raw text for sliding-window chunking
- **Impact**: Loses rich metadata about document structure
- **Suggestion**: Consider adding optional semantic chunking detection via regex patterns to reconstruct structure (e.g., detect "Chương I:" patterns and mark them as chapter boundaries)

---

## Phase 2.3: Chunk

### Step 3: **Chunking: `split_legal_document()`**
- **File**: `backend/app/services/chunker.py:131`
- **Purpose**: Split cleaned text into searchable, overlapping chunks
- **Method**: Paragraph-aware sliding-window

#### Process:

```python
1. Split text into paragraphs (on 2+ newlines)
2. Initialize buffer, buffer_length = 0
3. For each paragraph:
   a. If buffer_length + para_length > CHUNK_SIZE and buffer not empty:
      - FLUSH buffer to chunk
      - Increment chunk index
      - REWIND: Keep tail paragraphs (CHUNK_OVERLAP chars) for next chunk
   b. Add paragraph to buffer
   c. Update buffer_length
4. Final FLUSH of remaining buffer
```

#### Configuration:
- **CHUNK_SIZE**: 1000 characters (configurable in `.env`)
- **CHUNK_OVERLAP**: 100 characters (configurable in `.env`)
- **Chunk ID Format**: `{doc_id_str}_chunk_{index}` (e.g., "42_chunk_0")

#### Output: `list[SemanticChunk]`
```python
SemanticChunk(
    chunk_id="42_chunk_5",
    text_content="<paragraph text joined with \\n\\n>",
    metadata={
        "document_id": "42",
        "filename": "decree_2024",
        "chunk_index": 5,
    }
)
```

### 🔍 **Issue #2: Paragraph Detection Edge Cases**
- Splits on 2+ newlines only
- Legal documents often have single newlines within clauses
- May create unbalanced chunks (some articles > 1000 chars, split awkwardly)
- **Suggestion**: Add heuristic to detect legal section boundaries (articles, clauses) and avoid splitting them mid-content

### 🔍 **Issue #3: Chunk Size in .env**
- Current: 1000 chars, 100 char overlap
- For legal documents, may be too small (articles can be long)
- **Suggestion**: Consider document-type-aware chunk sizes or dynamic sizing based on content density

---

## Phase 2.4: Embed & Store (Qdrant Vector DB)

### Step 4a: **Qdrant Upsert: `upsert_document_chunks()`**
- **File**: `backend/app/services/qdrant_service.py:69`
- **Purpose**: Embed chunks and store vectors for semantic search
- **Process**:

```
1. Extract text from chunks: [chunk.text_content for c in chunks]
2. Embed all texts → embed_texts(texts)
3. Package chunks + vectors into PointStruct objects
4. Batch upsert to Qdrant (100 points/batch, configurable)
```

#### Sub-step: **Text Embedding: `embed_texts()`**
- **File**: `backend/app/services/embedding_service.py:70`
- **Purpose**: Convert text to dense vectors
- **Pluggable Backends**:
  - **SentenceTransformers** (default): `keepitreal/vietnamese-sbert`
    - Vietnamese-specific model
    - Normalized embeddings
    - Local execution (faster, no API calls)
  - **Ollama** (fallback): `nomic-embed-text`
    - Remote execution via HTTP API
    - Configured via `OLLAMA_BASE_URL`
  - **Gemini** (config option): Not in current code but commented
    - Via `app/core/gemini_client.py`

**Output**: `list[list[float]]` (vectors of dimension 768)

#### Sub-step: **Qdrant Storage: `upsert_chunks()`**
- **File**: `backend/app/services/qdrant_service.py:34`
- **Details**:
  - Creates/ensures Qdrant collection exists
  - Collection config: COSINE distance, 768-dim vectors
  - Point ID generation: `uuid5(NAMESPACE_DNS, f"doc:{document_id}:chunk:{chunk_id}")`
  - Payload (per point):
    ```python
    {
        "document_id": "42",
        "chunk_id": "42_chunk_5",
        "text": "<full chunk text>",
        "filename": "decree_2024",
        "chunk_index": 5,
        ...other metadata
    }
    ```
  - Batch operations: Default 100 points/batch
  - **Collection names by KB type**:
    - KbType.LAW → `law_collection`
    - KbType.ACTION_PLAN → `action_plan_collection`
    - KbType.INTERNAL → `internal_collection`

### 🔍 **Issue #4: Point ID Collision**
- Uses UUID5 (deterministic) from doc:chunk path
- If same chunk_id created twice, second upsert REPLACES first
- **Concern**: No version history; overwriting without warning
- **Suggestion**: Log when a chunk is being replaced, or add audit trail

### 🔍 **Issue #5: Embedding Model Mismatch**
- Stored vectors are 768-dim (SentenceTransformers)
- If user switches to Gemini (different dim), Qdrant collection fails
- **Suggestion**: Store embedding model name in collection metadata or settings, validate before upsert

---

## Phase 2.5: Build Knowledge Graph (Neo4j)

### Step 4b: **Graph Building: `build_chunk_graph()`**
- **File**: `backend/app/services/neo4j_service.py:314`
- **Purpose**: Create document/chunk nodes and link them sequentially
- **Only runs if**: `KbType.use_neo4j == True` (true for LAW, false for others)
- **Process**:

```
1. Convert chunks to dict (Pydantic model_dump)
2. Create Document node:
   MERGE (d:Document {document_id: "42"}) SET d.title = "decree_2024"

3. Batch create Chunk nodes (batch_size=200, configurable):
   MERGE (c:Chunk {chunk_id: "42_chunk_5"})
   SET c += metadata, c.text_content = "..."
   MERGE (d)-[:HAS_CHUNK]->(c)

4. Batch create NEXT_CHUNK edges:
   MATCH (a:Chunk {chunk_id: "42_chunk_5"})
   MATCH (b:Chunk {chunk_id: "42_chunk_6"})
   MERGE (a)-[:NEXT_CHUNK]->(b)
```

#### Neo4j Schema:
- **Nodes**: Document, Chunk
- **Edges**: HAS_CHUNK, NEXT_CHUNK (sequential linking)
- **Constraints**: Unique on chunk_id

#### Batch Configuration:
- **NEO4J_CHUNK_BATCH_SIZE**: 200 (default, configurable in `.env`)
- Helps with large documents (prevents memory overload)

### 🔍 **Issue #6: Limited Neo4j Utilization**
- Only creates Document → Chunk → Chunk chains
- Doesn't leverage legal document structure for queries
- Could enrich with:
  - Extracted article numbers (Điều X)
  - Clause hierarchy detection
  - Topic classification
- **Suggestion**: Consider semantic parsing to detect and store article/clause boundaries as separate nodes, enabling structured queries

### 🔍 **Issue #7: Sequential Links Only**
- NEXT_CHUNK edges are purely sequential
- Doesn't capture content relationships (e.g., article references)
- **Suggestion**: Add optional semantic linking based on entity recognition (e.g., if chunk mentions "Điều 42", link to Chunk containing Điều 42)

---

## Phase 3: Completion & Status Update

### Final Steps: `pipeline_process_and_embed_law()`

**Upon Success:**
```
1. Total elapsed time calculated
2. Status updated to COMPLETED
3. Log entry added with timestamp
4. Database committed
```

**Upon Failure:**
```
1. Exception caught with full traceback
2. Status updated to FAILED
3. Log entry added with error details
4. Traceback printed to stdout
5. Logger records error with context
```

---

## Pipeline Timing & Performance

### Typical Execution (per logs):
```
Parse:   ~0.5-2s    (PDF extraction)
Clean:   ~0.1-0.5s  (text processing)
Chunk:   ~0.05-0.1s (paragraph splitting)
Embed:   ~1-5s      (embedding inference)
Qdrant:  ~0.5-2s    (vector insertion)
Neo4j:   ~0.3-1s    (graph creation)
━━━━━━━━━━━━━━━━━━━━━
Total:   ~3-10s     (for typical law doc)
```

### Configurable Settings (`.env`):
```bash
# Chunking
CHUNK_SIZE=1000
CHUNK_OVERLAP=100

# Vector DB
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_UPSERT_BATCH_SIZE=100
EMBEDDING_DIMENSION=768

# Graph DB
NEO4J_URI=bolt://localhost:7687
NEO4J_CHUNK_BATCH_SIZE=200

# Embedding
EMBEDDING_BACKEND=sentence_transformers  # or ollama
ST_MODEL_NAME=keepitreal/vietnamese-sbert
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
```

---

## Error Handling & Resilience

### Current Approach:
1. **Sync Processing** (blocking background task)
   - If any step fails, entire pipeline stops
   - Status set to FAILED
   - Error logged with traceback
   
2. **No Rollback**
   - If Qdrant succeeds but Neo4j fails:
     - Vectors stored (orphaned)
     - Neo4j graph incomplete
     - **Issue**: Inconsistent state

3. **DB Commit at Each Step**
   - Status updates committed immediately
   - Safe against crashes between steps
   - But creates orphaned data if downstream fails

### 🔍 **Issue #8: Partial Failure State**
- Pipeline doesn't rollback Qdrant if Neo4j fails
- Creates inconsistent state (vectors exist, graph doesn't)
- **Suggestion**:
  - Option A: Wrap entire pipeline in transaction (but hard with async calls)
  - Option B: Add pre-flight validation (check Neo4j connection before starting)
  - Option C: Add cleanup logic to delete Qdrant vectors if Neo4j fails

### 🔍 **Issue #9: No Progress Webhook/Notification**
- Client polls `GET /v1/documents/{doc_id}` to check status
- No push notifications or webhooks
- **Suggestion**: Add optional WebSocket connection or Celery task events for real-time progress updates

---

## Deletion Pipeline

### Delete Endpoint: `DELETE /v1/documents/{doc_id}`
- **File**: `backend/app/routers/documents.py:119`
- **Orchestrator**: `delete_document_pipeline()`

**Flow**:
```
1. Delete from Qdrant (by document_id)
2. Delete from Neo4j (DETACH DELETE with cascade)
3. Delete from MinIO (original file)
4. Delete from MySQL (document record)
```

### 🔍 **Issue #10: Deletion Order Risk**
- Currently: Qdrant → Neo4j → MinIO → MySQL
- If Neo4j delete fails, orphaned vectors remain in Qdrant
- **Suggestion**: 
  - Start with DB deletion (soft delete to "DELETING" status)
  - Only commit deletion if all external stores complete
  - Or add async cleanup job for orphaned vectors

---

## Summary: Flow Checklist for Law Documents

| Phase | Function | File | Purpose | ⚠️ Issues |
|-------|----------|------|---------|----------|
| 1. Upload | `upload_document()` | documents.py | Validate & enqueue | - |
| 1.1 | `create_pending_document()` | document.py | DB record creation | - |
| 1.2 | `store_original_file()` | document.py | Archive PDF/DOCX | - |
| 1.3 | `attach_stored_file()` | document.py | Link to DB | - |
| 2.1 | `parse_document()` | parser.py | Extract text | #1: Loss of structure |
| 2.2 | `clean_legal_text()` | text_processor.py | Normalize & structure | - |
| 2.2.1 | `merge_broken_lines()` | text_processor.py | Smart line joining | - |
| 2.3 | `split_legal_document()` | chunker.py | Paragraph-aware chunks | #2, #3: Edge cases |
| 3 | `upsert_document_chunks()` | qdrant_service.py | Embed & store vectors | #4, #5: IDs & dims |
| 3.1 | `embed_texts()` | embedding_service.py | Convert to vectors | - |
| 3.2 | `upsert_chunks()` | qdrant_service.py | Qdrant insertion | - |
| 4 | `build_chunk_graph()` | neo4j_service.py | Create graph | #6, #7: Limited structure |
| 5 | Status update | document.py | Mark COMPLETED | - |
| Delete | `delete_document_pipeline()` | document.py | Clean up all stores | #10: Deletion order |

---

## High-Priority Improvements

### 1. **Structural Preservation (High Impact)**
   - **Problem**: PDF parsing loses article/clause structure
   - **Solution**: Add regex-based structure detection in `clean_legal_text()`:
     - Identify patterns like "Điều X", "Khoản Y", "Điểm Z"
     - Assign hierarchy levels during chunking
     - Store as metadata for richer retrieval
   - **Effort**: Medium (requires regex patterns for legal Vietnamese)

### 2. **Transactional Safety (High Priority)**
   - **Problem**: Partial failures leave orphaned data
   - **Solution**: 
     - Pre-flight checks before pipeline
     - Atomic multi-step operations or saga pattern
     - Add compensating transactions on failure
   - **Effort**: Medium-High

### 3. **Document-Aware Chunking (Medium Impact)**
   - **Problem**: Fixed chunk size doesn't respect legal boundaries
   - **Solution**: 
     - Detect article boundaries
     - Enforce "don't split articles" constraint
     - Vary chunk size by content density
   - **Effort**: Medium

### 4. **Embedding Model Validation (Medium Priority)**
   - **Problem**: Dimension mismatches if backend changes
   - **Solution**: 
     - Store embedding model name in Qdrant collection metadata
     - Validate on upsert
     - Reject if mismatch
   - **Effort**: Low

### 5. **Neo4j Schema Enrichment (Medium Impact)**
   - **Problem**: Only sequential links, missing semantic structure
   - **Solution**:
     - Detect article/clause/point nodes during chunking
     - Create corresponding graph nodes
     - Link chunks to structural units
   - **Effort**: Medium-High

### 6. **Progress Tracking (Low Priority)**
   - **Problem**: Client must poll for status
   - **Solution**: 
     - WebSocket connection for real-time updates
     - Or background task event logging
   - **Effort**: Low-Medium

---

## Code Quality Comments

### ✅ **Strengths**:
- Clean separation of concerns (parse → clean → chunk → embed → store)
- Configurable via `.env` (good for different doc types)
- Async-aware (`asyncio.to_thread()` for sync operations)
- Good logging with timestamps and context
- Pluggable embedding backends (local vs. remote)

### ⚠️ **Areas for Improvement**:
1. **Error Messages**: Very generic; could include recovery hints
2. **Validation**: Minimal input validation (e.g., verify chunks aren't empty)
3. **Duplicate Handling**: No warning if re-uploading same doc (overwrites silently)
4. **Testing**: No integration tests for pipeline (hard to debug failures)
5. **Monitoring**: No metrics/counters (e.g., chunks/sec, embedding latency)

---

## Conclusion

The Law document pipeline is well-structured but optimized for quantity over structure. For **legal documents with rich hierarchies**, consider:

1. **Preserve structure** during PDF parsing (regex detection)
2. **Enforce safety** with transactional patterns
3. **Leverage Neo4j** for structural queries (articles, clauses)
4. **Add observability** (metrics, real-time progress)

This will unlock the full potential of your RAG system for **precise, hierarchical legal retrieval**.
