import React from 'react';
import { numberToString } from '../core/utils.js';

const Stat = ({
  text, value, rank, zero,
}) => (
  <p>
    <span className="stattext">{(rank) ? `${text}: #` : `${text}: `}</span>
  &nbsp;
    <span className="statvalue">{numberToString(value, zero)}</span>
  </p>
);

export default Stat;
