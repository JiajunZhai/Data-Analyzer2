import type React from 'react';
import { parseHighlightSegments } from '../../../utils/textHighlighter';
import styles from './CardBody.module.css';

interface CardBodyProps {
  description: string;
}

export const CardBody: React.FC<CardBodyProps> = ({ description }) => {
  const segments = parseHighlightSegments(description);

  return (
    <div className={styles.body}>
      <p className={styles.text}>
        {segments.map((segment) => (
          <span
            key={`${segment.text}-${segment.isHighlight ? 'h' : 'n'}`}
            className={segment.isHighlight ? styles.highlight : undefined}
          >
            {segment.text}
          </span>
        ))}
      </p>
    </div>
  );
};
