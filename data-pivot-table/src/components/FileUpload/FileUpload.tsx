import React, { useCallback, useState } from 'react';
import { FileSpreadsheet, Folder, Link2, FileText, CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';
import { parseExcelFile, parseCSVFile, parseMappingCSV } from '../../utils/fileParser';
import type { DataRow } from '../../types';

interface FileUploadProps {
  onDataLoaded?: (headers: string[], data: DataRow[], fileName: string) => void;
  onMappingLoaded?: (headers: string[], rows: string[][], fileName: string) => void;
  variant?: 'card' | 'header' | 'mapping' | 'capsule' | 'capsule-mapping';
  mappingResult?: { scenarioCount: number; mappedRowCount: number };
  mappingWarnings?: string[];
}

const FileUpload: React.FC<FileUploadProps> = ({
  onDataLoaded,
  onMappingLoaded,
  variant = 'card',
  mappingResult,
  mappingWarnings,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<string>('');
  const [error, setError] = useState<string>('');
  const isHeaderVariant = variant === 'header';
  const isMappingVariant = variant === 'mapping';
  const isCapsuleVariant = variant === 'capsule' || variant === 'capsule-mapping';
  const isCapsuleMapping = variant === 'capsule-mapping';

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const truncateFileName = (name: string, maxLength: number = 25): string => {
    if (name.length <= maxLength) return name;
    const ext = name.split('.').pop() || '';
    const nameWithoutExt = name.slice(0, name.lastIndexOf('.'));
    const truncated = nameWithoutExt.slice(0, maxLength - ext.length - 4) + '...';
    return truncated + '.' + ext;
  };

  const handleFile = useCallback(async (file: File) => {
    try {
      setError('');

      if (isMappingVariant || isCapsuleMapping) {
        if (!file.name.endsWith('.csv')) {
          setError('映射表仅支持 CSV 格式');
          return;
        }
        setFileName(file.name);
        setFileSize(formatFileSize(file.size));
        const result = await parseMappingCSV(file);
        onMappingLoaded?.(result.headers, result.rows, file.name);
      } else {
        setFileName(file.name);
        setFileSize(formatFileSize(file.size));
        let result;
        if (file.name.endsWith('.csv')) {
          result = await parseCSVFile(file);
        } else {
          result = await parseExcelFile(file);
        }
        onDataLoaded?.(result.headers, result.data, file.name);
      }
    } catch (err) {
      console.error('文件解析失败:', err);
      const message = err instanceof Error ? err.message : '文件解析失败，请检查文件格式';
      if (isMappingVariant || isCapsuleMapping) {
        setError(message);
      } else {
        alert(message);
      }
    }
  }, [isMappingVariant, isCapsuleMapping, onDataLoaded, onMappingLoaded]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setFileName('');
    setFileSize('');
    setError('');
  }, []);

  const getFileIcon = (size = 16): React.ReactNode => {
    if (fileName.endsWith('.csv')) return <FileText size={size} />;
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) return <FileSpreadsheet size={size} />;
    return <Folder size={size} />;
  };

  if (isMappingVariant) {
    return (
      <div className="mapping-upload">
        <label className="mapping-upload-btn">
          <Link2 size={14} style={{ marginRight: 4 }} />
          <span>{fileName ? truncateFileName(fileName, 20) : '上传映射表'}</span>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
        </label>
        {mappingResult && (
          <span className="mapping-status">
            <CheckCircle size={13} style={{ marginRight: 2 }} /> 已映射 {mappingResult.mappedRowCount} 条，共 {mappingResult.scenarioCount} 个场景
          </span>
        )}
        {error && <span className="mapping-error"><XCircle size={13} style={{ marginRight: 2 }} /> {error}</span>}
        {mappingWarnings && mappingWarnings.length > 0 && (
          <span className="mapping-warning">
            <AlertTriangle size={13} style={{ marginRight: 2 }} /> {mappingWarnings.join(', ')} 在主数据中不存在
          </span>
        )}
      </div>
    );
  }

  if (isCapsuleVariant) {
    return (
      <label className={`file-capsule ${isCapsuleMapping ? 'file-capsule-mapping' : ''} ${isDragging ? 'capsule-dragging' : ''}`}>
        <span className="capsule-icon">{isCapsuleMapping ? <Link2 size={14} /> : <Folder size={14} />}</span>
        <span className="capsule-name" title={fileName || (isCapsuleMapping ? '映射表' : '数据源')}>
          {fileName ? truncateFileName(fileName, 18) : (isCapsuleMapping ? '映射表' : '数据源')}
        </span>
        {fileSize && <span className="capsule-size">{fileSize}</span>}
        <span className="capsule-action">{fileName ? '更换' : '选择'}</span>
        <input
          type="file"
          accept={isCapsuleMapping ? '.csv' : '.xlsx,.xls,.csv'}
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />
      </label>
    );
  }

  return (
    <div className={`file-upload ${isHeaderVariant ? 'file-upload-header' : ''}`}>
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''} ${isHeaderVariant ? 'header-drop-zone' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isHeaderVariant ? (
          <div className="header-file-status">
            <span className="header-file-icon">{getFileIcon(15)}</span>
            <span className="header-file-label">当前数据源：</span>
            <span className="header-file-name" title={fileName || '未选择文件'}>
              {fileName ? truncateFileName(fileName, 36) : '未选择文件'}
            </span>
            {fileSize && <span className="header-file-size">{fileSize}</span>}
            <span className="header-file-action">{fileName ? '更换数据' : '选择文件'}</span>
          </div>
        ) : fileName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
            <span style={{ fontSize: '24px', display: 'flex' }}>{getFileIcon(24)}</span>
            <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
              <p className="upload-text" title={fileName}>
                {truncateFileName(fileName)}
              </p>
              <p className="upload-hint">{fileSize}</p>
            </div>
            <button
              onClick={handleClear}
              style={{
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '4px',
                borderRadius: '4px',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#EF4444'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}
              title="清除文件"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="upload-icon"><FileSpreadsheet size={32} /></div>
            <p className="upload-text">拖拽 Excel/CSV 文件到此处</p>
            <p className="upload-hint">或点击选择文件</p>
          </>
        )}
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileInput}
          className="file-input"
        />
      </div>
    </div>
  );
};

export default FileUpload;
