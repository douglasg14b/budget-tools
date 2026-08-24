import { NavLink, useLocation } from 'react-router-dom';

import classes from './AppNav.module.css';

export function AppNav() {
    const location = useLocation();

    return (
        <nav className={classes.nav} aria-label="Primary">
            <NavLink className={navClassName} end to={{ pathname: '/', search: location.search }}>
                Queue
            </NavLink>
            <NavLink className={navClassName} end to={{ pathname: '/classify', search: location.search }}>
                Classify
            </NavLink>
            <NavLink className={navClassName} to={{ pathname: '/classify/table', search: location.search }}>
                Table
            </NavLink>
            <NavLink className={navClassName} to="/trips">
                Trips
            </NavLink>
        </nav>
    );
}

function navClassName({ isActive }: { isActive: boolean }): string {
    return isActive ? `${classes.link} ${classes.linkActive}` : classes.link;
}
