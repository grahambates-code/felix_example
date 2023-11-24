import React from 'react';

const PitchCompass = ({ pitch }) => {
    // Adjust rotation to fit within the semi-circle's range
    const dialRotation = `rotate(${pitch - 90} 50 50)`;

    return (
        <svg width="100" height="50" viewBox="0 0 100 50" transform={"rotate(90) translate(0,70)"}>
            {/* Semi-circle */}
            <path d="M 5 50 A 45 45 0 0 1 95 50" opacity="0.2" stroke="black" strokeWidth="2" fill="none" />



            {/* Dial */}
            <line x1="50" y1="50" x2="50" y2="10" stroke="black"  opacity="0.5" strokeWidth="2" transform={dialRotation} />
            {/* Arrow on the dial */}
            <polygon points="50,10 47,17 53,17" fill="black" opacity="0.5" transform={dialRotation} />

            {/* Center point */}

        </svg>
    );
};

export default PitchCompass;
