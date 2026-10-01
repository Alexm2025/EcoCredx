import { Component } from 'react'

/** Keeps one broken page from blanking the whole app. */
export class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="card notice">
        <h1>Something went wrong</h1>
        <p>This page could not be displayed. Your credits and funds are not affected.</p>
        <button type="button" className="btn primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </section>
    )
  }
}
