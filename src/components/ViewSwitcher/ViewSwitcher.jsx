import React from 'react';
import styles from './ViewSwitcher.module.css';

const ViewSwitcher = ({ currentView, onViewChange }) => {
    return (
        <div className={styles.container}>
            <button
                className={`${styles.button} ${currentView === 'week' ? styles.active : ''}`}
                onClick={() => onViewChange('week')}
            >
                Week
            </button>
            <button
                className={`${styles.button} ${currentView === 'month' ? styles.active : ''}`}
                onClick={() => onViewChange('month')}
            >
                Month
            </button>
        </div>
    );
};

export default ViewSwitcher;
