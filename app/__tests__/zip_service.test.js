let zipService;
let mockFile;
let mockBucket;
let mockDbRef;
let mockWriteStream;
let mockArchive;

function setupMocks() {
  mockWriteStream = {
    handlers: {},
    on(event, cb) {
      this.handlers[event] = cb;
      return this;
    }
  };

  mockArchive = {
    handlers: {},
    append: jest.fn(),
    finalize: jest.fn(),
    on(event, cb) {
      this.handlers[event] = cb;
      return this;
    },
    pipe: jest.fn(stream => {
      // simulate a successful upload once piped
      process.nextTick(() => stream.handlers.finish && stream.handlers.finish());
    })
  };

  mockFile = {
    createWriteStream: jest.fn(() => mockWriteStream),
    getSignedUrl: jest.fn(() => Promise.resolve(['https://signed-url.example.com/zip']))
  };

  mockBucket = {
    file: jest.fn(() => mockFile)
  };

  jest.doMock('archiver', () => jest.fn(() => mockArchive));

  jest.doMock('axios', () => ({
    get: jest.fn(() => Promise.resolve({ data: 'fake-stream-data' }))
  }));

  jest.doMock('@google-cloud/storage', () => ({
    Storage: jest.fn().mockImplementation(() => ({
      bucket: jest.fn(() => mockBucket)
    }))
  }));

  mockDbRef = {
    set: jest.fn(() => Promise.resolve()),
    once: jest.fn(() => Promise.resolve({ val: () => ({ 'zip-1': { filename: 'a.zip' } }) }))
  };

  jest.doMock('../../app/firebase', () => ({
    db: { ref: jest.fn(() => mockDbRef) }
  }));

  jest.doMock('../../app/photo_model', () => ({
    getFlickrPhotos: jest.fn(() =>
      Promise.resolve([
        { title: 'Boating', media: { m: 'http://example.com/1.jpg' } },
        { title: 'Signs', media: { m: 'http://example.com/2.jpg' } }
      ])
    )
  }));
}

beforeEach(() => {
  jest.resetModules();
  setupMocks();
  zipService = require('../../app/zip_service');
});

describe('zipPhotosForTags(tags, tagmode, prenom)', () => {
  test('should build and upload a zip, then save the job to firebase', () => {
    return zipService.zipPhotosForTags('california', 'all', 'anthony').then(filename => {
      expect(typeof filename).toBe('string');
      expect(filename).toMatch(/\.zip$/);
      expect(mockArchive.append).toHaveBeenCalledTimes(2);
      expect(mockArchive.finalize).toHaveBeenCalled();
      expect(mockDbRef.set).toHaveBeenCalledWith(
        expect.objectContaining({ filename, path: filename })
      );
    });
  });

  test('should reject when the upload stream errors', () => {
    mockArchive.pipe.mockImplementationOnce(stream => {
      process.nextTick(() =>
        stream.handlers.error && stream.handlers.error(new Error('upload failed'))
      );
    });

    return zipService.zipPhotosForTags('california', 'all', 'anthony').catch(error => {
      expect(error.message).toBe('upload failed');
    });
  });
});

describe('getDownloadUrl(filename)', () => {
  test('should return the signed url for the given filename', () => {
    return zipService.getDownloadUrl('some.zip').then(url => {
      expect(url).toBe('https://signed-url.example.com/zip');
      expect(mockBucket.file).toHaveBeenCalledWith('some.zip');
    });
  });
});

describe('getGeneratedZips(prenom)', () => {
  test('should return the zips stored for the given prenom', () => {
    return zipService.getGeneratedZips('anthony').then(zips => {
      expect(zips).toEqual({ 'zip-1': { filename: 'a.zip' } });
    });
  });

  test('should return an empty object when there are no zips', () => {
    mockDbRef.once.mockResolvedValueOnce({ val: () => null });

    return zipService.getGeneratedZips('anthony').then(zips => {
      expect(zips).toEqual({});
    });
  });
});
